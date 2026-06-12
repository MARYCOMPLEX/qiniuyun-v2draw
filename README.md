# VOICE CANVAS

> 风格市场热插拔 + 铁壁防御提示词约束 + HTTP 流式物理缓动的 Canvas OS 语音绘图 Agent 系统原型。

## 技术栈

- Next.js 15 (App Router) + React 19
- TypeScript 5.7（`strict` + `noUncheckedIndexedAccess`）
- Tailwind CSS 3.4
- Vercel AI SDK 4.3 (`streamObject`) + OpenAI Provider
- Zod 3.24（多维 Discriminated Union 校验）

## 本地启动

```bash
cp .env.example .env.local   # 仅在希望联通真模型时填写 OPENAI_API_KEY
npm install
npm run dev
```

未配置 `OPENAI_API_KEY` 时，前端会启用【全链路数据流模拟器】完整演示三阶段流式渲染。

## 目录结构

```
src/
├── app/
│   ├── api/generate-draw/
│   │   ├── route.ts             # 模型层：streamObject + 铁壁提示词
│   │   └── ironWallPrompt.ts    # 铁壁负向约束模板（纯函数）
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 # 胶水层：风格市场状态 + 模块拼装
├── shared/
│   ├── constants/marketStyles.ts# 风格市场静态注册表（3 套预设）
│   └── types/schema.ts          # Zod Discriminated Union 工具契约
└── features/
    ├── voice-control/
    │   ├── components/QuantumOrb.tsx
    │   ├── components/TelemetryHUD.tsx
    │   ├── components/StyleMarketPanel.tsx
    │   ├── hooks/useVoiceVAD.ts
    │   └── hooks/useDrawSimulator.ts
    └── art-canvas/
        ├── components/VectorStage.tsx
        └── utils/toolDispatcher.ts
```

## 核心约束

- **铁壁提示词**：见 `src/app/api/generate-draw/ironWallPrompt.ts`，强制输出 `{...}`、禁止 Markdown 包裹、`activeStyleId` 死锁、解析失败强制兜底 circle。
- **物理缓动**：`VectorStage.tsx` 内 `current += (target - current) * 0.12`，挤牙膏式增量在 60fps 下平滑收敛。
- **风格市场单信源**：所有色彩/WebGL 参数都从 `MARKET_STYLES` 取，组件层禁止硬编码色值。

## 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint（带 next/typescript） |
| `npm run typecheck` | 严格 TS 校验 |
| `npm test` | Vitest |

## 贡献指南

所有改动必须遵循根目录 [`AGENTS.md`](./AGENTS.md) 规范，PR 描述需显式声明"已遵循 AGENTS.md"。架构级决策记录到 `docs/adr/NNNN-title.md`。
