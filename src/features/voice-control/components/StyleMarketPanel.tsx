"use client";

import { MARKET_STYLES, type MarketStyle, type StyleId } from "@/shared/constants/marketStyles";

interface StyleMarketPanelProps {
  readonly activeStyleId: StyleId;
  readonly onActivate: (id: StyleId) => void;
}

const isActive = (style: MarketStyle, activeStyleId: StyleId): boolean =>
  style.id === activeStyleId;

/**
 * 风格市场 Floating 面板。
 * Why: 极简列表，单选切换；颜色色块直接来源于注册表，
 * 杜绝 UI 组件复制色值导致的"双信源"漂移。
 */
export function StyleMarketPanel({ activeStyleId, onActivate }: StyleMarketPanelProps) {
  return (
    <section
      aria-label="style-market"
      className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/80 p-4 backdrop-blur"
    >
      <header className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/50">
        <span>STYLE MARKET</span>
        <span className="text-white/30">v2.0</span>
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
                className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  active
                    ? "border-white/40 bg-white/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/30"
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-mono text-[12px] text-white">{style.name}</span>
                  <span className="text-[10px] text-white/50">{style.tagline}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {style.palette.map((c) => (
                    <span
                      key={c}
                      className="block h-3 w-3 rounded-full"
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
