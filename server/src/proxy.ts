import type { Request, Response } from 'express';
import { config } from './config.js';

/** Client-abort signal plus upstream timeout, combined. */
export function buildUpstreamSignal(clientGone?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(config.upstreamTimeoutMs);
  return clientGone ? AbortSignal.any([clientGone, timeout]) : AbortSignal.timeout(config.upstreamTimeoutMs);
}

/**
 * Forward a non-streaming JSON route to upstream.
 * Transport failures → 502; upstream HTTP errors → passthrough status with
 * generic body (upstream error text is logged, never reflected).
 */
export async function forwardJson(
  route: string,
  res: Response,
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
  clientGone?: AbortSignal
): Promise<void> {
  try {
    const upstream = await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: buildUpstreamSignal(clientGone),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error(`${route} upstream ${upstream.status}: ${detail.slice(0, 500)}`);
      res.status(upstream.status).json({ error: `Upstream request failed (${upstream.status})` });
      return;
    }
    res.json(await upstream.json());
  } catch (err) {
    console.error(`${route} proxy error:`, err instanceof Error ? err.message : err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream request failed' });
    } else {
      res.end();
    }
  }
}

/** Forward a JSON route that answers with an SSE stream; abort when the client disconnects. */
export async function forwardSse(
  route: string,
  req: Request,
  res: Response,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientGone = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) clientGone.abort();
  });

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: buildUpstreamSignal(clientGone.signal),
    });
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      throw Object.assign(new Error(detail), { upstreamStatus: upstream.status });
    }
    await pumpStream(upstream, res, clientGone.signal);
  } catch (err) {
    const status = (err as { upstreamStatus?: number }).upstreamStatus;
    console.error(`${route} proxy error:`, err instanceof Error ? err.message : err);
    if (!res.headersSent) {
      // SSE headers were set optimistically — restore JSON for the error response.
      res.setHeader('Content-Type', 'application/json');
      res.status(status && status >= 400 ? status : 502).json({ error: 'Upstream request failed' });
    } else {
      res.end();
    }
  }
}

/** Pump upstream SSE body into res; cancel upstream when the client disconnects. */
async function pumpStream(
  upstream: globalThis.Response,
  res: Response,
  clientGone: AbortSignal
): Promise<void> {
  const reader = upstream.body?.getReader();
  if (!reader) {
    res.end();
    return;
  }
  const onClientClose = () => {
    reader.cancel().catch(() => {});
  };
  clientGone.addEventListener('abort', onClientClose, { once: true });
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    // Mid-stream failure (client hangup / hung upstream): end cleanly.
    console.error('stream pump error:', err instanceof Error ? err.message : err);
    res.end();
  } finally {
    clientGone.removeEventListener('abort', onClientClose);
  }
}
