# Agnes AI Studio

A modern web UI for interacting with the Agnes AI API — chat, image generation, and video generation in one app.

## Features

- **Chat** — `agnes-2.5-flash` with streaming, thinking mode, reasoning display, token tracking
- **Image** — `agnes-image-2.0-flash` text-to-image & image-to-image, multiple sizes, download/copy
- **Video** — `agnes-video-v2.0` text/image/keyframe-to-video, async task polling, inline player
- **Settings** — live API key configuration via UI (no restart needed)
- **Monorepo** — Turborepo + npm workspaces

## Quick Start

```bash
# Install dependencies
npm install

# Set your API key
echo "AGNES_API_KEY=sk-your-key-here" > server/.env

# Run both server and client
npm run dev
```

Open `http://localhost:5173`

## Architecture

```
app-agnes/
├── server/          Express proxy (keeps API key server-side)
│   └── src/index.ts
├── client/          React + Vite + Tailwind
│   └── src/components/
│       ├── ChatModule.tsx
│       ├── ImageModule.tsx
│       └── VideoModule.tsx
├── package.json     Root (Turborepo)
└── turbo.json
```

## API Endpoints (via proxy)

| Module   | Model                | Endpoint                         |
|----------|----------------------|----------------------------------|
| Chat     | agnes-2.5-flash      | POST /v1/chat/completions        |
| Image    | agnes-image-2.0-flash| POST /v1/images/generations      |
| Video    | agnes-video-v2.0     | POST /v1/videos                  |

All requests go through the local proxy at `http://localhost:3001` which adds authentication automatically.

## Scripts

```bash
npm run dev        # Start both server + client (Turborepo)
npm run build      # Build both packages
npm start          # Start production server only
```

## Agnes AI

[Documentation](https://www.agnes-ai.com/en/docs/overview) · [API Base](https://apihub.agnes-ai.com)
