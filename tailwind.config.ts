import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#000000",
          cyan: "#06b6d4",
          magenta: "#db2777",
          violet: "#7c3aed",
        },
      },
      fontFamily: {
        // 全 UI 替换为得意黑 (Q1=A 决策); 任何 font-sans / font-mono 都走同一字体
        sans: [
          "var(--font-smiley)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: [
          "var(--font-smiley)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      keyframes: {
        glitch: {
          "0%,100%": { transform: "translate(0,0)" },
          "20%": { transform: "translate(-1px, 1px)" },
          "40%": { transform: "translate(1px, -1px)" },
          "60%": { transform: "translate(-1px, -1px)" },
          "80%": { transform: "translate(1px, 1px)" },
        },
        scan: {
          "0%": { backgroundPositionY: "0%" },
          "100%": { backgroundPositionY: "100%" },
        },
      },
      animation: {
        glitch: "glitch 1.6s infinite steps(2)",
        scan: "scan 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
