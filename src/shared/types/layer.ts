/**
 * ImageLayer 类型 — 多模态画布的核心数据模型。
 * 替代旧的 CanvasShape (矢量画布), 渲染层用 <img> 替代 canvas 2D 几何绘制。
 *
 * 见 docs/protocols/multimodal-canvas.md §2.1。
 */

export type LayerStatus = "pending" | "generating" | "done" | "failed";

export interface MaskPolygon {
  readonly polygon: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface ImageLayer {
  /** 前端分配的唯一 id, 格式: l-{ts36}-{n} */
  readonly id: string;
  /** 异步生图任务 id, null = 同步操作或未启动 */
  readonly jobId: string | null;
  readonly status: LayerStatus;

  // 内容
  readonly imageUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly seed?: number;
  readonly modelId: string;

  // 衍生关系
  readonly parentLayerId?: string;
  readonly generation: number;

  // 布局 (无限画布坐标系)
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly rotation: number;
  readonly opacity: number;
  readonly zIndex: number;

  // 选区
  readonly mask?: MaskPolygon | null;

  // 时序
  readonly createdAt: number;
  readonly completedAt: number | null;

  // 失败原因
  readonly error?: string;
}

export type LayerMap = ReadonlyMap<string, ImageLayer>;

export interface Viewport {
  readonly pan: { readonly x: number; readonly y: number };
  readonly zoom: number;
}

export interface CanvasState {
  readonly layers: LayerMap;
  readonly viewport: Viewport;
  readonly selectedLayerIds: ReadonlySet<string>;
  readonly defaultStageRect: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly history: ReadonlyArray<HistoryEntry>;
}

export interface HistoryEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  /** 应用前的快照 (用于撤销) */
  readonly beforeSnapshot: {
    readonly layers: LayerMap;
    readonly activeStyleId?: string;
  };
}

export interface PlatformState {
  readonly activeStyleId: string;
  readonly panels: {
    readonly leftSidebar: boolean;
    readonly capabilitiesPanel: boolean;
    readonly historyPanel: boolean;
  };
  readonly voice: {
    readonly listening: boolean;
    readonly ttsEnabled: boolean;
  };
  readonly showGrid: boolean;
  readonly viewportMirror?: Viewport;
}

/**
 * 默认画布常量
 * Why: stage 是用户视觉中心, 默认放新生成的 layer 到此区域中心。
 */
export const DEFAULT_STAGE_RECT = {
  x: 0,
  y: 0,
  w: 1024,
  h: 768,
} as const;

export const DEFAULT_LAYER_SIZE = {
  width: 512,
  height: 512,
} as const;

/**
 * 视口默认值 — pan=(0,0), zoom=1 表示 1:1 显示, 画布原点对齐 stage 左上。
 */
export const DEFAULT_VIEWPORT: Viewport = {
  pan: { x: 0, y: 0 },
  zoom: 1,
};

let layerIdCounter = 0;
/**
 * 前端分配 layer id — 时间戳 + 计数器, 全局唯一。
 * 不让 LLM 分配 id, 避免 id 冲突或重复绘制旧 layer。
 */
export const allocateLayerId = (): string => {
  layerIdCounter += 1;
  return `l-${Date.now().toString(36)}-${layerIdCounter}`;
};
