# 决策日志 (Decision Log)

> 累积式记录每次"我提选项 / 你拍板"的决策。最新在最上。
> 重大架构决策同时落入 `docs/adr/NNNN-*.md`；本文件作为轻量索引与会话级决策快查。
> 每条结构: **上下文 → 选择 → 备选 → 影响**。

---

## 2026-06-14 · 28 · TTS 30 秒挂死根因诊断 (PR #39 fix/tts-response-format-pcm)
- **上下文**: 用户切换 LLM provider 后 TTS 全部 canceled, 服务端 30 秒静默不返回。我前后两次错误推断 (key 不对 / yunwu 不能用阿里云端点) 都被用户当场打脸 "你又在编造"。
- **选择**: **裸 ws 直连阿里云 DashScope 端点诊断**, 不再凭印象推测。
- **备选**: 继续猜根因 (key/网络/路由) → 浪费时间。
- **影响**:
  - 用 Node 脚本绕过本地路由直连 `wss://dashscope.aliyuncs.com/api-ws/v1/realtime`, 一次性看到 `error: 'Invalid value: pcm_24000hz_mono_16bit. Supported values are: [mp3, wav, pcm, opus]'`
  - 真根因: 代码用了 Python SDK 常量 `pcm_24000hz_mono_16bit`, 但 ws 协议只接受 4 个枚举字符串
  - 阿里云返 error 不发 session.updated, 路由 await readyPromise 永远等 → 30 秒挂死
  - 修复: `response_format: "pcm"`
  - **教训**: 不确定时先 reproduce, 别推测; 用户说"你又在编造"是触发线, 必须立刻切换到证据驱动调试。

## 2026-06-14 · 27 · TTS canceled 根因 (PR #38 fix/tts-canceled-render-loop)
- **上下文**: 浏览器 Network 看 `/api/tts` 请求全部 canceled, 不报错也无响应。
- **选择**: 排查发现 page.tsx 把 `void ttsSpeakRef.current(narration)` 写在 React **render 函数体**里 (不在 useEffect 内), 流式中 narration 累积变化 N 次, 每次触发新 speak, 上一次 fetch 立刻被 abort。
- **备选**: 加防抖 / 节流 (治标不治本, 副作用仍在 render 里)。
- **影响**:
  - 改用 `useEffect([canvas.streaming, canvas.latestNarration])`
  - 流式中 (streaming=true) 不读, 等落定才 speak
  - 朗读最终 narration 一次, 不再被中间帧打断
  - **原则**: 所有副作用必须在 useEffect 内, render 函数纯净。

## 2026-06-14 · 26 · UI 改动需用户明确要求 (AGENTS.md 2.8)
- **上下文**: 用户两次反馈 "右侧上面的组件又没有了" — 我重写 AgentConversationPanel 时把 TelemetryHUD 顶部 24 格音量条柱状图丢了。第二次反馈语气加重: "没有要求改 UI 不能改, 写入规则。"
- **选择**: 双层固化:
  1. 仓库规范: AGENTS.md 新增 2.8 "UI 改动边界" 节, 跟 PR 流程一样强制
  2. 跨会话记忆: `~/.claude/projects/G--qiniuyun/memory/feedback_ui_change_needs_request.md`
- **备选**: 只在内存里记 (失败) / 只在 AGENTS.md 写 (跨会话不会自动加载)。
- **影响**:
  - 禁止: 删除/移动/重命名已有组件 / 改布局栅格 / 删视觉元素 / 拆面板 / 改主题 token
  - 允许: 修复确认的 UI bug (hydration / 错位) / 新增可选 prop 默认保持原行为 / typo
  - 判定规则: 重写组件时新版本字段比旧少, PR 描述必须显式声明 "删除了 X 元素"
  - **触发线**: 任何 .tsx 改动如果删 JSX 元素或改 className 布局, 先停下问用户。

## 2026-06-14 · 25 · 矢量+图像混合画布 — drawio 优先, 图像作 mxCell 注入 (PR #28-32 五连)
- **上下文**: 经过两轮重大转向 (矢量画布 → 多模态画布), 用户最终决策: "默认矢量, 然后对于一些小素材我可能语音让 AI 生成然后拼到矢量图上"。要达到 next-ai-drawio 一致的矢量信息图效果。
- **选择**: 引入 `react-drawio` iframe + 4 工具协议, **图像作为 image mxCell 注入到 drawio 同一画布**, 不维护独立 LayerMap 浮层。
- **备选**:
  - A 双 stage 切换 (drawio + InfiniteStage 用 platform.switch_view 切) — 两套交互, 复杂
  - B 统一 LayerMap 容纳 ShapeLayer + ImageLayer — 自己实现 layer/cell 双协议, 代码大
  - C iframe 上层叠浮 image — 图像不能跟矢量交互, 失去拖拽对齐能力
- **影响**:
  - 引入 `react-drawio` 包, DiagramContext 整张 chartXML 替代 LayerMap
  - 抄 next-ai-drawio (Apache-2.0) 的 4 工具: `drawio.display_diagram` / `edit_diagram` / `append_diagram` / `get_shape_library`
  - 工具集统一 `unifiedEnvelopeSchema` (canvas + drawio + platform 三类共 31 工具)
  - SSE done 事件 → buildImageMxCell → applyEditDiagram add 注入 drawio
  - 抄 9 个 shape library .md (flowchart/basic/aws4/k8s/azure2/gcp2/bpmn/network/arrows2)
  - directorPrompt 重写 31 工具版 (默认矢量 + 边路由 7 法则 + image mxCell 写法)
  - 删除 InfiniteStage / MaskOverlay / useViewport / useMaskTool 等 8 个旧组件 (PR-δ)
  - 历时 5 个 PR (#28 PR-α 基础 → #29 PR-β dispatcher → #30 PR-γ 图注入 → #31 PR-ε 接通 → #32 PR-δ 清理)

## 2026-06-14 · 24 · Agent 对话面板替代 STREAM LOG (PR #24)
- **上下文**: 用户反馈"现在的 stream log 不符合需求, 不像在与智能体对话, 我需要了解智能体在干什么"。
- **选择**: 用 ChatGPT 式对话框替代 TelemetryHUD 单行日志。
- **备选**: 保留单行日志 + 加 narration 行 (不够 chat 感)。
- **影响**:
  - 新建 `AgentConversationPanel`: 用户消息右对齐 + 智能体消息左对齐 + 动作 chip 列表 (待/运行/完成/失败)
  - useCanvasOrchestrator 加 `turns: ConversationTurn[]` 状态, 每条 cmd 转 AgentAction chip
  - SSE 异步任务完成时同步更新 chip 状态 + turn 整体 done/failed
  - 27 工具的中文动作摘要由前端按 tool 名 + 关键参数构造 (不依赖 LLM 多花 tokens)

## 2026-06-14 · 23 · 多模态画布协议 v1.0 — 双层工具集架构 (PR #14-#22 七连)
- **上下文**: 之前矢量画布的 LLM 输出"low" — 单帧 partial 只能画一个原子图形, 没有全图协调。用户决定转型为"语音操控的多模态 AI 创作平台"。
- **选择**: 双层工具集严格隔离 — `canvas.*` 业务 (改 LayerMap) + `platform.*` 平台 (改 UI), **两层不可交叉**。命名空间用点分。
- **备选**:
  - A 单层工具 (业务/平台混在 canvas.*) — 不利于扩展平台级 OS 范本
  - B 命名空间用 `_` (`canvas_generate_image`) — 缺少分层语义
- **影响**:
  - 27 个工具 (19 canvas + 8 platform), zod schema 全覆盖
  - 历时 7 个 PR (#14 PR-A 协议 → #15 PR-B Image Provider → #16 PR-C InfiniteStage → #17 PR-E platformReducer → #18 PR-D orchestrator → #19 PR-F directorPrompt → #20 PR-G Mask)
  - 平台扩展契约: 添加新业务/平台工具有明确的步骤指南
  - **3 周后再次转型为 drawio + image mxCell 混合方向**, InfiniteStage 等被废弃 (条目 25), 但工具集架构延续

## 2026-06-13 · 22 · A 方案浏览器直连阿里云 NLS — 实时识别取代 batch (PR #1 phase A)
- **上下文**: batch 上传整段 PCM 模式延迟 4+ 秒, 用户体感"非实时"。考虑切实时识别。
- **选择**: A 方案 — 浏览器直连阿里云 ws gateway, 后端只签发短期 token。首字延迟 ~250ms。
- **备选**:
  - B SSE 中继 (双跳 RTT + 服务端长连接压力)
  - C 自管 ws server (Next.js 不原生支持, 部署复杂)
- **影响**:
  - 后端 `/api/asr-token` 用 `@alicloud/pop-core` CreateToken RPC, globalThis 缓存抗 HMR
  - 浏览器手写阿里云 ws 协议 (token 走 query, ws 不能设自定义 header)
  - VAD 改 push 模式 — onUtteranceStart / onAudioFrame / onUtteranceEnd
  - PCM 入队等 RecognitionStarted 事件 (修复 'Invalid binary message while ROUTING' 协议错)
  - token fetch + start() 双 in-flight 锁防 VAD 抖动并发请求
  - IDLE_TIMEOUT 视为静默事件不弹 UI 警告

## 2026-06-13 · 21 · A + D 方案纠偏 — 既成事实 + 触发线 (PR #2 + #3)
- **上下文**: 项目早期已有 30+ commit 直推 main, 不符合 AGENTS.md 5.4 PR 流程。我提了 4 个补救方案。
- **选择**: A + D 组合 —
  - A: 当前 6 个未推 commit 转新分支 `feat/realtime-asr-phaseA` 提 PR
  - D: AGENTS.md 5.5 加项目阶段适用范围 + 强制 PR 触发线 (单人原型阶段允许直推, 触发线后强制 PR)
- **备选**:
  - B 在线伪 PR (cherry-pick + force push 重写已合并 commit, 实操不靠谱)
  - C 全部 revert + 重做 (历史更乱)
- **影响**:
  - 主分支既往直推不回头折腾, 触发线之后强制 PR
  - 4 条触发线: 第二位贡献者 / 部署生产 / 外部 review / CI/CD 上线
  - **本次引入 CI/CD 同时即触发 D 方案**, 之后所有改动走 PR
  - 既成事实条款: 触发线之前直推 commit 不补 PR / 不重写历史

## 2026-06-13 · 20 · CI/CD 简化迁移 — 单服务版本 (PR #4)
- **上下文**: 想从 anyfast/ad 项目迁 CI/CD 链路 (Docker + GitHub Actions + 阿里云 ACR + SSH 部署)。voice-canvas 比 ad 简单很多 (单服务 vs app+worker+postgres+redis)。
- **选择**: 简化版 — Dockerfile 三阶段 + docker-compose 单 app 服务 + workflow 触发条件保留 `tag: dev-*`。
- **备选**: 完整复制 ad 链路 (worker / migrate / blue-green 等多余)。
- **影响**:
  - 7 个新文件: Dockerfile / docker-compose.yml / .dockerignore / workflows/deploy.yml / DEPLOY.md / next.config standalone / /api/health
  - 用户配置清单: GitHub Secrets/Variables (ALIYUN_USERNAME/PASSWORD/REGISTRY/NAMESPACE + SSH_HOST/KEY) + 服务器 deploy 用户 + .env.docker
  - 手动触发支持 skip_build 重部署
  - **同时承担 D 方案触发线作用** — 此后所有改动强制走 PR

## 2026-06-13 · 19 · ASR 录音管道 ScriptProcessor → AudioWorklet (fix)
- **上下文**: 阿里云 NLS 用样例 PCM 完美识别, 用我们前端录的 PCM 完全识别空。诊断脚本生成 wav 让用户播放, 用户反馈"听不到, 是噪音, 不连续的"。
- **选择**: 砍 ScriptProcessor (浏览器已 deprecate, 会丢帧), 改用 AudioWorklet 跑独立 audio thread。
- **备选**: 加大 ScriptProcessor buffer (治标不治本, throttle 仍存在)。
- **影响**:
  - 录音从断续噪声变成稳定 16k 单声道 PCM
  - AudioContext 强制 `{sampleRate: 16000}`, 源头出 16k 不再降采样
  - 启用 echoCancellation/noiseSuppression/autoGainControl 三件套清噪
  - 不连 destination, 避免回声
  - 持续录 + 前置缓冲 4 帧, 防止开口头部丢字
  - 断句后立即清空 chunks 继续监听下一句

## 2026-06-13 · 18 · ASR 路线 SR vs ST (fix)
- **上下文**: 阿里云 NLS 有两种产品: SpeechRecognition (一句话识别) vs SpeechTranscription (实时识别)。用户配额是 ST 的 2 路并发。
- **选择**: 用 SR (一句话识别) 走 worker pool 模拟实时。
- **备选**: ST 实时识别 (但 SDK API 较复杂, 配额限制严格)。
- **影响**:
  - 一句话一连接, close 后必关 (协议要求)
  - Worker pool 容量 2 匹配配额, 阻塞超过用 FIFO 队列
  - TLS/socket 失败自动重试 3 次, 指数退避 200/400/800ms
  - **3 周后 A 方案直接切回浏览器直连 ST 实时识别** (条目 22)

## 2026-06-13 · 17 · LLM Provider 重写 — Vercel AI SDK v6 streamText + tools
- **上下文**: 之前用 streamObject 强制 `tool_choice='required'`, 跟 deepseek/qwen thinking mode 不兼容 (返 400)。换模型必崩。
- **选择**: streamText + tools (默认 tool_choice='auto'), system prompt 强指令模型必须 call tool。
- **备选**:
  - 自实现 ws 协议 (重复造轮子)
  - 用 dashscope SDK 透传 enable_thinking=false (Vercel AI SDK 不暴露 extra_body)
- **影响**:
  - 4 个 provider (openai / anthropic / google / deepseek) 通过 ai-providers.ts 统一抽象
  - 从 `fullStream` 提取 `tool-input-delta` 组装 partial JSON 文本流, 前端 useDrawStream 零改动
  - 兼容所有主流 thinking mode 模型
  - 历时一次反复 — 中途砍掉 Vercel SDK 改用各家官方 SDK, 后又装回 Vercel SDK (条目 25 借鉴 next-ai-drawio 时确认 Vercel SDK 是工业级方案, 自己实现踩坑成本高)

---

## 2026-06-12 · 11 · UI 密度调优 + light shader 配方修复 (PR · feat/ui-density-and-light-shader)
- **上下文**: 用户截图反馈两侧栏"内容宽度太小, 字体元素也小"; OBSIDIAN 切到亮主题后 ShaderOrb"看不清"。
- **选择**:
  - **侧栏宽度**: B — 280→360, 340→420 (中等放大 ~25%)。
  - **基础字号**: B — 主流可读阈值 12-14px (主体 13, 标签 12, 主名 14)。
  - **light shader**: A — 重写亮色配方, 不反色, 用 palette 深色作"水墨晕开"。
- **备选**:
  - A 保守 (+20%) / C 响应式百分比 (小屏更挤)。
  - A 11-13 / C 13-15。
  - B 半透明背板绷带式 / C 完全换一套 shader。
- **影响**:
  - page grid 280/340 → 360/420, gap+padding 4 → 5。
  - ShaderOrb 176 → 208px, 标签从 10 → 12px。
  - 三块面板字号统一上调 (header/标签 10→12, 主体 12→14, 主名 12→14)。
  - light 模式 fragment shader 独立分支:
    · `ink = clamp(glow*0.18)` 压幅避免过曝。
    · 中心更深、外圈淡出 (`smoothstep edge`), 水墨在宣纸晕开质感。
    · alpha 0.55..0.9 渐变而非固定 0.85, 减少糊边。
  - dark 配方原版保留, light 旧反色公式 `vec3(1.0)-finalColor*0.7` 删除 (低强度区会全白)。

---

## 2026-06-12 · 10 · 主题系统 + ShaderOrb 替换 (PR · feat/theme-and-shader-orb)
- **上下文**: 用户反馈"面板太黑没层次"且"没有主题切换"。同时希望左侧录音动效换为 stitch 提供的 WebGL fluid shader。
- **选择**:
  - **配色调整范围**: B — 引入主题系统 + 调面板, 不只是给面板加层次。
  - **主题切换语义**: B — 复用风格市场作为主题切换器, 不引入独立 dark/light toggle。OBSIDIAN 重塑为 light 亮色档与 CYBER/VAN_GOGH 暗色档形成对照。
- **备选**:
  - A 仅给面板加层次 / C 完全重做视觉。
  - A dark/light 两套 / C 完全自定义 token。
- **影响**:
  - `MarketStyle` 接口新增 `ui` 子对象, 7 个 token (mode/canvasBg/panelBg/panelBorder/textPrimary/textMuted/textSuccess)。
  - OBSIDIAN background `030712` 黑石板 → `f1f5f9` 亮石板, palette 反向到深色主体。**这是对 instructions.md 的偏离, 需更新规格描述**。
  - 三块面板 (StyleMarket / Capabilities / TelemetryHUD) 与 page.tsx 全部移除 white/black 硬编码, 改读 ui token, 切风格 = 切主题。
  - 录音动效: SVG QuantumOrb 删除, 替换为 ShaderOrb (WebGL fluid shader)。
    · uniforms: u_color1/2/3 来自 marketStyle.palette, u_volume 来自麦克风 RMS, u_listening 控制速率, u_lightMode 在亮主题下反色。
    · 用 useFluidShader hook 隔离 WebGL 副作用, ResizeObserver 同步 buffer, cleanup 释放 GL 资源防内存泄漏。
  - 测试 marketStyles "locks Obsidian background" 用例同步改造为亮色档断言, 新增 ui token 完整性用例。

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
