/**
 * 风格市场静态注册表。
 * Why: 静态硬编码三套风格预设，运行时不可变，作为 toolDispatcher
 * 与 QuantumOrb 的色盘单一信源；扩充新风格时新增条目即可。
 */

export type StyleId = "SKILL_CYBER_PUNK" | "SKILL_VAN_GOGH" | "SKILL_OBSIDIAN";

export interface MarketStyleUiTokens {
  /** 整体明暗判定 — 影响 shader 是否反色, 字体是否加粗 */
  readonly mode: "dark" | "light";
  /** 面板背景 (玻璃拟态半透明) */
  readonly panelBg: string;
  /** 面板边框 */
  readonly panelBorder: string;
  /** 主体文字 */
  readonly textPrimary: string;
  /** 次要文字 (tagline, tooltip 等) */
  readonly textMuted: string;
  /** 成功态 (capabilities ready 的高亮) */
  readonly textSuccess: string;
  /** 整页 body 背景 — 比 background 略亮一档, 让面板有层次 */
  readonly canvasBg: string;
}

export interface MarketStyle {
  readonly id: StyleId;
  readonly name: string;
  readonly tagline: string;
  readonly background: string;
  readonly palette: readonly [string, string, string];
  readonly accent: string;
  readonly ui: MarketStyleUiTokens;
  readonly webgl: {
    readonly turbulenceFreq: number;
    readonly turbulenceOctaves: number;
    readonly displacementScale: number;
  };
  readonly lora: {
    readonly modelTag: string;
    readonly weight: number;
  };
}

export const MARKET_STYLES: readonly MarketStyle[] = [
  {
    id: "SKILL_CYBER_PUNK",
    name: "Cyberpunk Neon",
    tagline: "霓虹三色 / 电磁紊乱",
    background: "#000000",
    palette: ["#06b6d4", "#db2777", "#7c3aed"],
    accent: "#db2777",
    ui: {
      mode: "dark",
      canvasBg: "#0a0a14",
      panelBg: "rgba(15, 23, 42, 0.72)",
      panelBorder: "rgba(6, 182, 212, 0.32)",
      textPrimary: "#e2e8f0",
      textMuted: "rgba(226, 232, 240, 0.55)",
      textSuccess: "#22d3ee",
    },
    webgl: { turbulenceFreq: 0.014, turbulenceOctaves: 2, displacementScale: 18 },
    lora: { modelTag: "cyberpunk-neon-v3", weight: 0.82 },
  },
  {
    id: "SKILL_VAN_GOGH",
    name: "Van Gogh Impressionism",
    tagline: "深蓝撞色 / 笔触流动",
    background: "#020617",
    palette: ["#f59e0b", "#1d4ed8", "#10b981"],
    accent: "#f59e0b",
    ui: {
      mode: "dark",
      canvasBg: "#0b1228",
      panelBg: "rgba(15, 23, 65, 0.72)",
      panelBorder: "rgba(245, 158, 11, 0.34)",
      textPrimary: "#fef3c7",
      textMuted: "rgba(254, 243, 199, 0.6)",
      textSuccess: "#10b981",
    },
    webgl: { turbulenceFreq: 0.008, turbulenceOctaves: 3, displacementScale: 12 },
    lora: { modelTag: "vangogh-impressionism-v2", weight: 0.74 },
  },
  {
    id: "SKILL_OBSIDIAN",
    name: "Obsidian Minimal",
    tagline: "极简石板 / 高信号 SaaS",
    background: "#f1f5f9",
    palette: ["#1e293b", "#475569", "#0284c7"],
    accent: "#0284c7",
    ui: {
      mode: "light",
      canvasBg: "#e2e8f0",
      panelBg: "rgba(255, 255, 255, 0.78)",
      panelBorder: "rgba(2, 132, 199, 0.28)",
      textPrimary: "#0f172a",
      textMuted: "rgba(30, 41, 59, 0.65)",
      textSuccess: "#0284c7",
    },
    webgl: { turbulenceFreq: 0.005, turbulenceOctaves: 1, displacementScale: 6 },
    lora: { modelTag: "obsidian-minimal-v1", weight: 0.6 },
  },
] as const;

const STYLE_INDEX = new Map<StyleId, MarketStyle>(MARKET_STYLES.map((s) => [s.id, s]));

export const DEFAULT_STYLE_ID: StyleId = MARKET_STYLES[0]!.id;

export const getStyleById = (id: StyleId): MarketStyle => {
  const found = STYLE_INDEX.get(id);
  if (!found) {
    throw new Error(`MARKET_STYLE_NOT_FOUND: ${id}`);
  }
  return found;
};

/**
 * 解析 useAccentColor 标记 → 实际命中色。
 * Why: 把"激活风格 + 是否走 accent"的色彩解析收敛在一处，
 * 避免画布层和 HUD 各自实现导致语义漂移。
 */
export const resolveStrokeColor = (style: MarketStyle, useAccentColor: boolean): string => {
  if (useAccentColor) return style.accent;
  return style.palette[0];
};
