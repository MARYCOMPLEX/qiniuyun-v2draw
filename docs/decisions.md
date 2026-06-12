# 决策日志 (Decision Log)

> 累积式记录每次"我提选项 / 你拍板"的决策。最新在最上。
> 重大架构决策同时落入 `docs/adr/NNNN-*.md`；本文件作为轻量索引与会话级决策快查。
> 每条结构: **上下文 → 选择 → 备选 → 影响**。

---

## 2026-06-12 · 09 · 全 UI 字体替换为得意黑 (Smiley Sans)
- **上下文**: 想统一品牌字体, 强化赛博朋克斜体氛围。得意黑只有 Oblique 一个字重 (设计为斜体展示字)。
- **选择**:
  - **覆盖范围**: A — 全 UI 替换, font-sans 与 font-mono 同时指向得意黑。
  - **加载方式**: (ii) next/font/local 自托管 woff2, 不依赖外网 CDN。
- **备选**: B 只替换 sans 保留终端 mono / (i) jsdelivr CDN 节省仓库体积。
- **影响**:
  - `public/fonts/SmileySans-Oblique.woff2` 入库 ~1.1MB (OFL-1.1)。
  - tailwind config sans/mono 双指向 `var(--font-smiley)`, 整个 UI 含 HUD 都带轻微斜度。
  - fallback 链含 PingFang SC / Microsoft YaHei, 字体加载失败时中文不掉字。

---

## 2026-06-12 · 08 · Provider 自管错误响应 (PR2 · Q3)
- **上下文**: `route.ts` 现在手写 `respondError` envelope；`null.ts` 也写一份。错误格式分散两处。
- **选择**: (ii) Provider 接口直接返回 `LlmStreamResponse`，自带错误响应。路由层零 `try/catch`。
- **备选**: (i) 路由层包 `try/catch` 统一转成 envelope。
- **影响**: 路由瘦身；错误格式一致性由 `LlmProvider` 接口契约保证；`null.ts` 已是该模式，无返工。

## 2026-06-12 · 07 · LLM 按 toolType 分工 (PR2 · Q1)
- **上下文**: 当前所有 toolType 共用一个 `OPENAI_MODEL`。`ATOMIC_SHAPE` 几何路由用 gpt-4o-mini 即可；`DIFFUSION_MELT` 提示词润色想用大模型；混用一套很浪费。
- **选择**: B — 每 toolType 可独立配 `(provider, model)` 二元组。默认 `LLM_DEFAULT_PROVIDER` + `LLM_DEFAULT_MODEL`，按需覆盖。
- **备选**: A — 单 Provider 一把抓所有 toolType。
- **影响**: env 复杂度上升 (5-8 字段)；显著省钱与提质并存；registry 层多一层 `byToolType` 路由。

## 2026-06-12 · 06 · Provider 与 Model 解耦 (PR2 · Q2)
- **上下文**: 想用 yunwu 网关同时跑 gemini 与 claude。如果 Provider 一对一绑死模型 ID，要建 N 个 Provider 相互重复。
- **选择**: Provider = 仅封装"端点 + key + SDK 协议 + 消息格式适配"，与 Model 完全正交。Model 作为运行时参数透传。
- **备选**: Provider 一对一绑死模型 (如 `provider: "gpt-4o-mini"`)。
- **影响**:
  - `LlmProvider` 接口移除 `modelId` 字段，改为 `streamDrawTool({ ..., model: string })`。
  - `openai-compatible` 一个 Provider 即可同时承载 OpenAI / yunwu / 月之暗面 / 智谱 / 自建网关，靠 `baseURL` 与 `model` 切换。
  - 配置形态: `LLM_DEFAULT_PROVIDER=openai-compatible` + `LLM_DEFAULT_MODEL=gemini-2.0-flash` + `OPENAI_BASE_URL=https://yunwu.ai/v1`。

## 2026-06-12 · 05 · 偏好持久化 (PR1)
- **上下文**: capabilities 开关用户偏好放哪存？
- **选择**: `localStorage`。
- **备选**: `sessionStorage` (关 Tab 即忘) / URL query (可分享)。
- **影响**: 重启浏览器记住选择；跨设备不同步；隐私模式下静默降级，开关仍生效但不持久化。

## 2026-06-12 · 04 · TTS 作为可选能力 (PR1 规划阶段)
- **上下文**: TTS 是增强能力非必需。要不要做？怎么暴露开关？
- **选择**:
  - **未配置 UI**: A — 置灰可见 + tooltip 说明原因。
  - **默认开关**: B — ready 即就绪、但默认关，用户主动开。
  - **首选 Provider**: B — ElevenLabs (音色优先于成本)。
  - **触发粒度**: A — 每工具调用都播。
  - **静音策略**: B — 全播 (含兜底 circle)。
  - **去抖兜底**: 仅当 partial→完整对象边界触发一次；同 toolType 1.5s 内不重复播 (会话过吵)。
- **备选**: 全隐藏 / 默认开 / OpenAI TTS (复用 key 但音色平庸)。
- **影响**: 触发逻辑要在 `toolDispatcher` 加 partial→complete 边界检测；播报话术按 toolType 模板化。

## 2026-06-12 · 03 · Provider Registry 架构 (PR1)
- **上下文**: 链路第三方能力散布在 `route.ts`、`useVoiceVAD`、`useDrawSimulator`，全部硬编码或锁死。
- **选择**: 5 大能力域分目录 (`llm/asr/tts/image/search`)，每域 `types.ts` + `null.ts` (Null Object) + `registry.ts` (env 工厂)。前后端共用 `detectCapabilities` 纯函数。
- **备选**: 单一 `services/` 目录平铺 / 每能力域独立 npm 包。
- **影响**: 符合 AGENTS.md 1.2 "按业务域 + 门面 index.ts"；客户端走 `/api/capabilities` 拿 ready 矩阵 (process.env 不暴露)。

## 2026-06-12 · 02 · Commit 拆分粒度 (初次提交)
- **上下文**: AGENTS.md 4.3 要求"每 commit 可独立 checkout 编译"，但脚手架前没东西可编译。
- **选择**: 按依赖顺序 + 逻辑单元拆 7 个 commit (脚手架 → shared → api → features → app → tests)。承认 `feat(app)` 之前 app 不可运行的合理例外。
- **备选**: 单个大 commit / 严格满足"每 commit 可编译" (需写占位 page，违反"少即是多")。
- **影响**: 每 commit message 信息密度高；revert 单个 feature commit 不影响其它特征；首屏脚手架 commit 8000+ 行因 lockfile 体积，符合 5.1 例外条款。

## 2026-06-12 · 01 · 仓库初始化与 .gitignore 策略
- **上下文**: 工作目录有 `instructions.md` (用户给 Claude 的任务说明) 与 `AGENTS.md` (规范文档)。是否都入库？
- **选择**: 忽略 `instructions.md`；只入库 `AGENTS.md`。
- **备选**: 全部入库 / 全部忽略。
- **影响**: 任务输入与工程产物分离；`.gitignore` 显式列出 `instructions.md`；同时忽略 `.next/`、`node_modules/`、`*.tsbuildinfo`、`.env*.local` 等常规项。
