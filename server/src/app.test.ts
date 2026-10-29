/**
 * Integration tests (Round 4) — run the real express app on an ephemeral port
 * and assert rate-limiter key derivation with/without `trust proxy`, and that
 * a client hanging up mid-SSE aborts the upstream request.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo, Server } from 'node:net';

import { createApp } from './app.js';
import type { Express } from 'express';

interface RunningApp {
  server: Server;
  base: string;
  close(): Promise<void>;
}

function start(app: Express): Promise<RunningApp> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function putKey(base: string, xff?: string): Promise<number> {
  const resp = await fetch(`${base}/api/key`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    body: JSON.stringify({ key: 'sk-test' }),
  });
  await resp.text().catch(() => '');
  return resp.status;
}

test('health endpoint reports trust proxy state (default: off)', async () => {
  const running = await start(createApp());
  try {
    const body = (await (await fetch(`${running.base}/api/health`)).json()) as { trustProxy: boolean };
    assert.equal(body.trustProxy, false);
  } finally {
    await running.close();
  }
});

test('without trust proxy: X-Forwarded-For is ignored (spoofing cannot bypass the limiter)', async () => {
  const running = await start(createApp({ keyMgmtMax: 1 }));
  const { base } = running;
  try {
    assert.equal(await putKey(base, '9.9.9.9'), 200);
    // Different forwarded IP, same socket → same limiter bucket.
    assert.equal(await putKey(base, '8.8.8.8'), 429);
    assert.equal(await putKey(base), 429);
  } finally {
    await running.close();
  }
});

test('with trust proxy: limiter keys on the real client IP from X-Forwarded-For', async () => {
  const running = await start(createApp({ keyMgmtMax: 1, trustProxy: 1 }));
  const { base } = running;
  try {
    assert.equal(await putKey(base, '9.9.9.9'), 200);
    // Same forwarded IP → throttled…
    assert.equal(await putKey(base, '9.9.9.9'), 429);
    // …but a different real client is unaffected (per-IP buckets).
    assert.equal(await putKey(base, '8.8.8.8'), 200);
  } finally {
    await running.close();
  }
});

test('client hanging up mid-SSE aborts the upstream request', async () => {
  // Mock upstream: streams one chunk, then holds the connection open. It
  // records whether its request side saw a close BEFORE responding fully.
  let upstreamSawAbort = false;
  let upstreamSawNormalEnd = false;
  const upstream = http.createServer((req, res) => {
    req.on('close', () => {
      if (!res.writableEnded) upstreamSawAbort = true;
    });
    req.on('end', () => { upstreamSawNormalEnd = true; });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"delta":"hi"}\n\n');
    // Keep the stream open; if the proxy aborts, the response dies with it.
  });

  const upstreamPort = await new Promise<number>((resolve) => {
    upstream.listen(0, () => resolve((upstream.address() as AddressInfo).port));
  });

  const running = await start(
    createApp({ apiBaseUrl: `http://127.0.0.1:${upstreamPort}` })
  );

  try {
    // Client reads one chunk, then hangs up mid-stream.
    const controller = new AbortController();
    const resp = await fetch(`${running.base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
      signal: controller.signal,
    });
    const reader = resp.body!.getReader();
    const first = await reader.read();
    assert.ok(!first.done, 'should receive the first upstream chunk');
    controller.abort();

    // Give the abort a moment to propagate upstream.
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(upstreamSawAbort, true, 'upstream request should be aborted on client disconnect');
    assert.equal(upstreamSawNormalEnd, false, 'upstream stream should not have completed normally');
  } finally {
    await running.close();
    upstream.close();
  }
});

test('SSE stream completes normally when the client stays connected', async () => {
  let upstreamSawAbort = false;
  const upstream = http.createServer((req, res) => {
    req.on('close', () => {
      if (!res.writableEnded) upstreamSawAbort = true;
    });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"delta":"a"}\n\n');
    setTimeout(() => res.end('data: [DONE]\n\n'), 50);
  });
  const upstreamPort = await new Promise<number>((resolve) => {
    upstream.listen(0, () => resolve((upstream.address() as AddressInfo).port));
  });
  const running = await start(createApp({ apiBaseUrl: `http://127.0.0.1:${upstreamPort}` }));

  try {
    const resp = await fetch(`${running.base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    const text = await resp.text();
    assert.match(text, /data: \{"delta":"a"\}/);
    assert.match(text, /\[DONE\]/);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(upstreamSawAbort, false, 'no abort when the client reads the whole stream');
  } finally {
    await running.close();
    upstream.close();
  }
});
