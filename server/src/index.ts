import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_BASE_URL = process.env.API_BASE_URL || 'https://apihub.agnes-ai.com';
let API_KEY = process.env.AGNES_API_KEY || '';

app.use(cors());
app.use(express.json());

// Allow overriding key via X-Api-Key header or dedicated endpoint
app.use((req: Request, _res: Response, next: NextFunction) => {
  const override = req.headers['x-api-key'] as string | undefined;
  const key = override || API_KEY;
  req.headers['authorization'] = `Bearer ${key}`;
  next();
});

app.put('/api/key', (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Invalid key' });
  }
  API_KEY = key.trim();
  console.log(`API key updated (first ${key.slice(0,8)}...)`);
  res.json({ status: 'ok' });
});

app.get('/api/key', (_req, res) => {
  res.json({ hasKey: !!API_KEY && API_KEY !== 'your_api_key_here', maskedKey: API_KEY ? API_KEY.slice(0, 6) + '...' + API_KEY.slice(-4) : '' });
});

app.all('/v1/chat/completions', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
  })
    .then(r => {
      if (!r.ok) return r.text().then(t => { throw new Error(t); });
      return r;
    })
    .then(r => {
      const reader = r.body?.getReader();
      if (!reader) { res.send(''); return; }
      const decoder = new TextDecoder();
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { res.end(); return; }
        res.write(decoder.decode(value));
        pump();
      });
      pump();
    })
    .catch(err => {
      console.error('Chat proxy error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
});

app.all('/v1/responses', (req, res) => {
  fetch(`${API_BASE_URL}/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
  })
    .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
    .then(data => res.json(data))
    .catch(err => {
      console.error('Responses proxy error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
});

app.all('/v1/messages', (req, res) => {
  req.headers['x-api-key'] = API_KEY;
  req.headers['anthropic-version'] = '2023-06-01';
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  fetch(`${API_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(req.body),
  })
    .then(r => {
      if (!r.ok) return r.text().then(t => { throw new Error(t); });
      return r;
    })
    .then(r => {
      const reader = r.body?.getReader();
      if (!reader) { res.send(''); return; }
      const decoder = new TextDecoder();
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { res.end(); return; }
        res.write(decoder.decode(value));
        pump();
      });
      pump();
    })
    .catch(err => {
      console.error('Messages proxy error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
});

app.all('/v1/images/generations', (req, res) => {
  fetch(`${API_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
  })
    .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
    .then(data => res.json(data))
    .catch(err => {
      console.error('Image proxy error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
});

app.post('/v1/videos', (req, res) => {
  fetch(`${API_BASE_URL}/v1/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
  })
    .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
    .then(data => res.json(data))
    .catch(err => {
      console.error('Video create error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
});

app.get('/agnesapi', (req, res) => {
  const videoId = req.query.video_id as string;
  const modelName = req.query.model_name as string;
  let url = `${API_BASE_URL}/agnesapi?video_id=${videoId}`;
  if (modelName) url += `&model_name=${modelName}`;
  
  fetch(url, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  })
    .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
    .then(data => res.json(data))
    .catch(err => {
      console.error('Video result error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: !!API_KEY && API_KEY !== 'your_api_key_here' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Agnes proxy server running on http://localhost:${PORT}`);
});
