"use client";

import { MARKET_STYLES, type MarketStyle, type StyleId } from "@/shared/constants/marketStyles";

interface StyleMarketPanelProps {
  readonly activeStyleId: StyleId;
  readonly onActivate: (id: StyleId) => void;
  readonly activeStyle: MarketStyle;
}

const isActive = (style: MarketStyle, activeStyleId: StyleId): boolean =>
  style.id === activeStyleId;

/**
 * 风格市场 Floating 面板。
 * Why: 极简列表, 单选切换; 颜色色块直接来源于注册表 (杜绝双信源)。
 * 面板自身 UI 配色读 activeStyle.ui token, 切风格 = 切主题 (Q2=B 决策)。
 */
export function StyleMarketPanel({
  activeStyleId,
  onActivate,
  activeStyle,
}: StyleMarketPanelProps) {
  const ui = activeStyle.ui;
  return (
    <section
      aria-label="style-market"
      className="flex w-full flex-col gap-3 rounded-2xl border p-5 backdrop-blur-md"
      style={{ backgroundColor: ui.panelBg, borderColor: ui.panelBorder }}
    >
      <header
        className="flex items-center justify-between text-xs uppercase tracking-[0.3em]"
        style={{ color: ui.textMuted }}
      >
        <span>STYLE MARKET</span>
        <span style={{ opacity: 0.6 }}>v2.0</span>
      </header>
      <ul className="flex flex-col gap-2">
        {MARKET_STYLES.map((style) => {
          const active = isActive(style, activeStyleId);
          return (
            <li key={style.id}>
              <button
                type="button"
                onClick={() => onActivate(style.id)}
                aria-pressed={active}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition"
                style={{
                  borderColor: active ? ui.panelBorder : "transparent",
                  backgroundColor: active
                    ? ui.mode === "light"
                      ? "rgba(2,132,199,0.08)"
                      : "rgba(255,255,255,0.06)"
                    : "transparent",
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm" style={{ color: ui.textPrimary }}>
                    {style.name}
                  </span>
                  <span className="text-xs" style={{ color: ui.textMuted }}>
                    {style.tagline}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {style.palette.map((c) => (
                    <span
                      key={c}
                      className="block h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: c, boxShadow: `0 0 6px ${c}` }}
                    />
                  ))}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
