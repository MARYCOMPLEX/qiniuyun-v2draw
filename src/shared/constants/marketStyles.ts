/**
 * 风格市场静态注册表。
 * Why: 静态硬编码三套风格预设，运行时不可变，作为 toolDispatcher
 * 与 QuantumOrb 的色盘单一信源；扩充新风格时新增条目即可。
 */

export type StyleId = "SKILL_CYBER_PUNK" | "SKILL_VAN_GOGH" | "SKILL_OBSIDIAN";

export interface MarketStyle {
  readonly id: StyleId;
  readonly name: string;
  readonly tagline: string;
  readonly background: string;
  readonly palette: readonly [string, string, string];
  readonly accent: string;
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
    webgl: { turbulenceFreq: 0.008, turbulenceOctaves: 3, displacementScale: 12 },
    lora: { modelTag: "vangogh-impressionism-v2", weight: 0.74 },
  },
  {
    id: "SKILL_OBSIDIAN",
    name: "Obsidian Minimal",
    tagline: "极简石板 / 高信号 SaaS",
    background: "#030712",
    palette: ["#f8fafc", "#475569", "#38bdf8"],
    accent: "#38bdf8",
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
