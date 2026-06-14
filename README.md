<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)">
    <img alt="VOICE CANVAS" src="https://img.shields.io/badge/VOICE_CANVAS-000000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTBjLjc3IDAgMS41Mi0uMDkgMi4yNS0uMjVMMjIgMjJsLTIuNzUtMi43NUMyMC45MSAxNy41MiAyMiAxNC43NyAyMiAxMmMwLTUuNTItNC40OC0xMC0xMC0xMHoiIGZpbGw9IiMwNmI2ZDQiLz48L3N2Zz4=">
  </picture>
</p>

<h1 align="center">VOICE CANVAS</h1>
<p align="center"><strong>Speak. Style. Generate.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/next.js-15.1-black?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/react-19-06b6d4?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/tailwind-css-06b6d4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <a href="https://github.com/features/actions"><img src="https://img.shields.io/badge/CI-passing-brightgreen?logo=githubactions&logoColor=white" alt="CI"></a>
</p>

<p align="center">
  An AI-powered voice-driven diagram agent system — <em>speak naturally, watch AI compose diagrams in real time</em>.<br/>
  Built with Vercel AI SDK, multi-provider LLM routing, streaming partial-JSON dispatch, and a pluggable style market.
</p>

---

## ✨ Showcase

| Cyberpunk Neon | Van Gogh | Obsidian |
|:---:|:---:|:---:|
| *Neon cyan + magenta + violet* | *Oil-paint warmth* | *Monochrome glassmorphism* |

Three built-in visual themes with live hot-swap. Each style owns its own color palette, WebGL parameters, UI tokens, and LoRA tag — configurable via `src/shared/constants/marketStyles.ts`.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Voice Input (Web VAD → Aliyun NLS Realtime ASR → ws)  │
├─────────────────────────────────────────────────────────┤
│  /api/generate-draw  (streamText + 31 tools + director) │
├─────────────────────────────────────────────────────────┤
│  Dispatcher 3-way fan-out:                              │
│    • Platform  reducer     (theme / panels / grid)       │
│    • Canvas    sync        (add_layer / remove / clear)  │
│    • Canvas    async       (image gen → SSE job-done)   │
├─────────────────────────────────────────────────────────┤
│  Self-built SVG renderer   (mxCell → DOM, no iframe)    │
├─────────────────────────────────────────────────────────┤
│  TTS feedback    (wss dashscope Qwen3-TTS-Realtime)     │
├─────────────────────────────────────────────────────────┤
│  SQLite sessions  (better-sqlite3 WAL, per-session turns)│
└─────────────────────────────────────────────────────────┘
```

**Core data flow:** Voice → ASR → LLM (streaming) → 3-channel dispatch → SVG render → TTS narration. Each turn is persisted to SQLite with full conversation history.

---

## 🧱 Tech Stack

### Runtime & Framework

| Category | Library | Version |
|----------|---------|---------|
| Web framework | [Next.js](https://nextjs.org) (App Router) | 15.1.7 |
| UI library | [React](https://react.dev) | 19.0.0 |
| Language | [TypeScript](https://www.typescriptlang.org) (`strict` + `noUncheckedIndexedAccess`) | 5.7.3 |
| Styling | [Tailwind CSS](https://tailwindcss.com) | 3.4.17 |
| Font | 得意黑 Smiley Sans (self-hosted woff2) | — |

### AI & LLM

| Category | Library | Version |
|----------|---------|---------|
| AI SDK core | [`ai`](https://sdk.vercel.ai) (Vercel AI SDK) | 6.0.204 |
| Anthropic provider | [`@ai-sdk/anthropic`](https://www.npmjs.com/package/@ai-sdk/anthropic) | 3.0.84 |
| DeepSeek provider | [`@ai-sdk/deepseek`](https://www.npmjs.com/package/@ai-sdk/deepseek) | 2.0.38 |
| Google provider | [`@ai-sdk/google`](https://www.npmjs.com/package/@ai-sdk/google) | 3.0.82 |
| OpenAI provider | [`@ai-sdk/openai`](https://www.npmjs.com/package/@ai-sdk/openai) | 3.0.71 |
| OpenAI client | [`openai`](https://www.npmjs.com/package/openai) (DashScope TTS) | 6.42.0 |
| Aliyun SDK | [`@alicloud/pop-core`](https://www.npmjs.com/package/@alicloud/pop-core) (NLS ASR) | 1.8.0 |

### Data & Validation

| Category | Library | Version |
|----------|---------|---------|
| Schema validation | [Zod](https://zod.dev) | 3.25.76 |
| SQLite | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (synchronous, WAL) | 11.5.0 |
| Partial JSON | [partial-json](https://www.npmjs.com/package/partial-json) (streaming parse) | 0.1.7 |
| WebSocket | [`ws`](https://github.com/websockets/ws) | 8.21.0 |

### Testing & Tooling

| Category | Library | Version |
|----------|---------|---------|
| Test runner | [Vitest](https://vitest.dev) | 2.1.8 |
| Linter | [ESLint](https://eslint.org) + `eslint-config-next` | 9.18.0 |
| CSS post-processing | [Autoprefixer](https://github.com/postcss/autoprefixer) + [PostCSS](https://postcss.org) | 10.4.20 / 8.5.1 |
| Native addons | `bufferutil` + `utf-8-validate` (optional, for WebSocket perf) | 4.1.0 / 6.0.6 |

### DevOps

| Category | Tool | Purpose |
|----------|------|---------|
| Container | Docker (multi-stage `node:20-alpine`) | Production image |
| Orchestration | docker-compose | Single-node deploy |
| CI/CD | GitHub Actions | Build → Push ACR → Deploy SSH |
| Health check | `/api/health` endpoint | Docker HEALTHCHECK + deploy validation |

---

## 📦 Project Structure

```
src/
├── app/                              # Next.js App Router entry points
│   ├── api/
│   │   ├── asr-token/route.ts        # Aliyun NLS token provisioning
│   │   ├── canvas/generate/route.ts  # Image generation (async)
│   │   ├── canvas/jobs/[id]/route.ts # Job status polling
│   │   ├── canvas/jobs/stream/route.ts # SSE job completion stream
│   │   ├── capabilities/route.ts     # Provider readiness matrix
│   │   ├── generate-draw/
│   │   │   ├── route.ts              # Main LLM streaming endpoint
│   │   │   ├── directorPrompt.ts     # System prompt (31 drawio tools)
│   │   │   └── canvasState.ts        # Current chartXML injection
│   │   ├── health/route.ts           # Liveness probe
│   │   ├── sessions/route.ts         # Session CRUD
│   │   ├── sessions/[id]/route.ts    # Single session
│   │   ├── sessions/[id]/turns/route.ts # Turn history
│   │   └── tts/route.ts              # Text-to-speech streaming
│   ├── layout.tsx                    # Root layout (Smiley Sans)
│   ├── page.tsx                      # Main page: VAD→ASR→LLM→canvas
│   └── globals.css
│
├── features/
│   ├── canvas/                       # Multi-modal canvas orchestrator
│   ├── diagram/                      # DrawIO: SVG renderer, dispatcher, fx
│   │   ├── components/DrawIoStage.tsx
│   │   ├── contexts/DiagramContext.tsx
│   │   ├── svg/                      # Self-built mxCell → SVG renderer
│   │   │   ├── mxCellSvgRenderer.tsx
│   │   │   ├── parseMxXml.ts
│   │   │   └── shapeRenderers.ts
│   │   ├── fx/                       # Marquee, StreamingOrb
│   │   └── utils/
│   ├── platform/                     # Global UI state reducer
│   ├── sessions/                     # Session history panel + hooks
│   └── voice-control/                # VAD, ASR, TTS, ShaderOrb, StyleMarket
│
├── shared/
│   ├── constants/marketStyles.ts     # Style market registry (single source of truth)
│   ├── db/
│   │   ├── connection.ts             # better-sqlite3 singleton + migrations
│   │   ├── migrations.ts             # Schema versioning (PRAGMA user_version)
│   │   ├── sessionRepo.ts            # Session repository
│   │   └── idAllocator.ts            # Unique ID generator
│   ├── providers/
│   │   ├── llm/                      # Multi-provider LLM routing
│   │   ├── asr/                      # ASR provider registry
│   │   ├── tts/                      # TTS provider registry
│   │   ├── image/                    # Image generation registry
│   │   ├── search/                   # Search provider registry
│   │   └── capabilities.ts           # Runtime capability detection
│   └── types/                        # Unified tool schemas (Zod discriminated unions)
│
└── tests/                            # 19 test suites, 2020+ lines
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18.18.0 (recommend 20+)
- npm 9+

### Local Development

```bash
# 1. Clone and install
git clone <repo-url> && cd voice-canvas
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — at minimum set:
#   OPENAI_API_KEY     (DashScope key for LLM)
#   OPENAI_BASE_URL    (defaults to dashscope.aliyuncs.com)

# 3. Start
npm run dev
# → http://localhost:3000
```

Without an API key, the frontend runs a **full dataflow simulator** demonstrating the three-phase streaming pipeline (voice → dispatch → canvas).

### Docker

```bash
docker build -t voice-canvas .
docker run -p 3000:3000 --env-file .env.docker voice-canvas
```

---

## 🎨 Style Market

The style market is the single source of truth for all visual tokens — colors, WebGL parameters, UI tokens, and LoRA tags. Add a new style with one entry:

```typescript
// src/shared/constants/marketStyles.ts
export const MARKET_STYLES: readonly MarketStyle[] = [
  {
    id: "SKILL_CYBER_PUNK",
    name: "Cyberpunk Neon",
    background: "#000000",
    palette: ["#06b6d4", "#db2777", "#7c3aed"],
    accent: "#06b6d4",
    ui: { mode: "dark", panelBg: "...", /* ... */ },
    webgl: { turbulenceFreq: 2.7, /* ... */ },
    lora: { modelTag: "cyberpunk-neon", weight: 0.75 },
  },
  // ... add more styles here
]
```

No component ever hardcodes a color value — everything flows from `activeStyle`.

---

## 🛡 Prompt Engineering

The system prompt (`directorPrompt.ts`) enforces a strict **iron-wall defense** pattern:

- **Output format**: Must produce `{"commands": [...], "narration": "..."}` — no markdown wrapping, no explanatory text.
- **Tool constraints**: Maximum 8 commands per response. Commands come from 31 typed drawio tools (display/edit/layout/arrange/duplicate/delete/set-theme/generate-image/web-search).
- **Schema enforcement**: Zod discriminated union validation of all tool arguments at the streaming boundary.
- **Fallback**: Invalid partial-JSON frames are silently skipped; malformed final output falls back to a safe default.

---

## 📡 API Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate-draw` | `POST` | Main LLM streaming endpoint (JSON lines) |
| `/api/canvas/generate` | `POST` | Async image generation (returns job ID) |
| `/api/canvas/jobs/[id]` | `GET` | Poll job status |
| `/api/canvas/jobs/stream` | `GET` | SSE stream of job completions |
| `/api/capabilities` | `GET` | Provider readiness matrix |
| `/api/asr-token` | `GET` | Aliyun NLS WebSocket token |
| `/api/tts` | `POST` | Text-to-speech (PCM/WAV) |
| `/api/sessions` | `GET` `POST` | Session list / create |
| `/api/sessions/[id]` | `GET` `PATCH` `DELETE` | Single session CRUD |
| `/api/sessions/[id]/turns` | `GET` | Turn history for session |
| `/api/health` | `GET` | Liveness probe |

---

## 🔧 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Production build (`output: standalone`) |
| `npm start` | Start production server |
| `npm run lint` | ESLint (Next.js + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` strict check |
| `npm test` | Vitest (run once) |
| `npm run test:watch` | Vitest (watch mode) |

---

## 🧪 Testing

19 test suites, 2000+ lines of test code. Coverage targets: **≥ 80% lines, ≥ 70% branches**.

```
tests/
├── llmProviders.test.ts            # Provider routing + registry
├── directorPrompt.test.ts          # Iron-wall prompt validation
├── canvasTools.test.ts             # Canvas command schema
├── drawioDispatcher.test.ts        # drawio tool dispatch logic
├── drawioFoundation.test.ts        # Diagram core utilities
├── buildCanvasState.test.ts        # ChartXML state builder
├── conversationHistory.test.ts     # Multi-turn context assembly
├── imageJobStore.test.ts           # Async job tracking
├── imageMxCell.test.ts             # Image mxCell injection
├── parseMxStyle.test.ts            # mxCell style parser
├── parseMxXml.test.ts              # mxCell XML parser
├── marketStyles.test.ts            # Style market integrity
├── platformReducer.test.ts         # Platform state machine
├── sessionRepo.test.ts             # SQLite session persistence
├── sessionsApi.test.ts             # REST API integration
├── capabilities.test.ts            # Provider capability detection
├── ttsRoute.test.ts                # TTS endpoint
├── pcm.test.ts                      # PCM → WAV conversion
└── aliyunQwenRealtimeTts.test.ts   # TTS provider integration
```

---

## 🤝 Contributing

All contributions must follow the [AGENTS.md](./AGENTS.md) specification:

- **Conventional Commits** — `feat:`, `fix:`, `refactor:`, etc.
- **Small PRs** — target ≤ 400 lines net change, max 30 files.
- **TDD** — tests first, 80%+ coverage.
- **Code Review** — at least 1 human reviewer + `code-reviewer` agent.
- **No silent UI changes** — component rewrites must declare what was added/removed.

Architecture decisions are recorded in `docs/adr/` as Architecture Decision Records.

---

## 🎥 Demo

<div align="center">
  <video src="https://v2i.gojia.cloud/videos/video.mp4" controls width="100%" style="max-width: 960px; border-radius: 12px;">
    Your browser does not support the video tag.
  </video>
  <p><em>Voice → ASR → LLM streaming → diagram generation — full pipeline demo</em></p>
</div>

---

## 📄 License

MIT
