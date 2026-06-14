/**
 * Agent 对话历史 — 跟踪每轮交互的完整生命周期。
 *
 * 一个 ConversationTurn = 用户一句话 + LLM 决策 + 多个工具调用 + 最终结果。
 *
 * Why: 之前的 history (HistoryEntry[]) 只跟踪命令快照用于 undo, 不展现"智能体在思考"
 * 的过程。新模型增加 narration / actions 摘要 / 工具状态, 让 UI 可以渲染对话框,
 * 用户能看到智能体的每一步动作。
 */

export type ConversationActorRole = "user" | "agent" | "system";

export interface AgentAction {
  /** 工具名 (canvas.generate_image / platform.set_theme / ...) */
  readonly tool: string;
  /** 一句中文动作摘要 (前端从命令推断, 例: "生成森林背景") */
  readonly summary: string;
  /** 关联的 layer / job 状态 */
  readonly status: "pending" | "running" | "done" | "failed";
  /** 失败原因 */
  readonly error?: string;
  /** 关联的 layer id (如有) */
  readonly layerId?: string;
}

export interface ConversationTurn {
  readonly id: string;
  readonly timestamp: number;
  /** 用户原话 */
  readonly userUtterance: string;
  /** LLM 的 narration (中文一句话, 会被 TTS 朗读) */
  readonly narration: string | null;
  /** LLM 决策的动作列表 */
  readonly actions: ReadonlyArray<AgentAction>;
  /** 整轮状态: streaming(LLM 正在吐) / executing(命令应用中) / done / failed */
  readonly status: "streaming" | "executing" | "done" | "failed";
  /** Agent loop 的轮次号 (单次响应 = 1, 自我修正 = 2+) */
  readonly turnIndex: number;
}

let turnCounter = 0;
export const allocateTurnId = (): string => {
  turnCounter += 1;
  return `t-${Date.now().toString(36)}-${turnCounter}`;
};

/**
 * 把工具命令翻译成中文动作摘要 — UI 显示用。
 *
 * 设计: 前端不依赖 LLM 给摘要 (那要多花 tokens), 而是按 tool 名 + 关键参数构造。
 */
export const buildActionSummary = (
  tool: string,
  args: Record<string, unknown>,
): string => {
  switch (tool) {
    case "canvas.generate_image":
      return `生成图像: ${truncate(String(args.prompt ?? ""), 32)}`;
    case "canvas.generate_background":
      return `生成背景: ${truncate(String(args.prompt ?? ""), 32)}`;
    case "canvas.generate_character":
      return `生成角色: ${truncate(String(args.prompt ?? ""), 32)}`;
    case "canvas.generate_variations":
      return `生成 ${args.count ?? "?"} 张备选`;
    case "canvas.generate_reference_compose":
      return `参考合成: ${truncate(String(args.prompt ?? ""), 32)}`;
    case "canvas.edit_image":
      return `编辑图像: ${truncate(String(args.prompt ?? ""), 32)}`;
    case "canvas.inpaint_layer":
      return `局部重绘: ${truncate(String(args.replacePrompt ?? ""), 32)}`;
    case "canvas.outpaint_layer":
      return `扩展画面: ${args.direction ?? ""}`;
    case "canvas.style_transfer":
      return `风格迁移: ${truncate(String(args.stylePrompt ?? ""), 32)}`;
    case "canvas.remove_background":
      return "去除背景";
    case "canvas.upscale_layer":
      return `放大 ${args.scale ?? "?"} 倍`;
    case "canvas.move_layer":
      return "移动图层";
    case "canvas.resize_layer":
      return "调整大小";
    case "canvas.rotate_layer":
      return `旋转 ${args.degrees ?? 0}°`;
    case "canvas.set_layer_props":
      return "调整属性";
    case "canvas.arrange_layers":
      return `排列 (${args.pattern ?? ""})`;
    case "canvas.delete_layer":
      return "删除图层";
    case "canvas.clear_canvas":
      return "清空画布";
    case "canvas.regenerate_layer":
      return "重新生成";
    case "canvas.undo":
      return `撤销 ${args.steps ?? 1} 步`;
    case "platform.set_theme":
      return `切换主题: ${args.themeId}`;
    case "platform.open_panel":
      return `打开面板: ${args.panelId}`;
    case "platform.close_panel":
      return `关闭面板: ${args.panelId}`;
    case "platform.toggle_voice":
      return args.enabled ? "开启语音" : "关闭语音";
    case "platform.toggle_tts":
      return args.enabled ? "开启 TTS" : "关闭 TTS";
    case "platform.toggle_grid":
      return args.enabled ? "显示网格" : "隐藏网格";
    case "platform.zoom_canvas":
      return args.mode === "fit" ? "适配画布" : "缩放画布";
    case "platform.pan_canvas":
      return "平移画布";
    default:
      return tool;
  }
};

const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

/**
 * 把已完成的 turns 拍成 LLM 多轮上下文 messages。
 *
 * - 只取最近 maxTurns 个 turn (按时间顺序保留尾部)
 * - 跳过 streaming 中或 narration 为空的 turn (没有有效 assistant 回复)
 * - assistant 内容只用 narration; actions 摘要不发, 省 token
 */
export interface HistoryMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export function buildHistoryMessages(
  turns: ReadonlyArray<ConversationTurn>,
  maxTurns: number,
): ReadonlyArray<HistoryMessage> {
  if (maxTurns <= 0) return [];
  const recent = turns.slice(-maxTurns);
  const messages: HistoryMessage[] = [];
  for (const turn of recent) {
    if (!turn.userUtterance.trim()) continue;
    if (!turn.narration || !turn.narration.trim()) continue;
    messages.push({ role: "user", content: turn.userUtterance });
    messages.push({ role: "assistant", content: turn.narration });
  }
  return messages;
}
