import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        raised: "rgb(var(--color-raised) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-dark": "rgb(var(--color-accent-hover) / <alpha-value>)",
        bitcoin: "rgb(var(--color-bitcoin) / <alpha-value>)",
        mint: "rgb(var(--color-accent) / <alpha-value>)",
        sell: "rgb(var(--color-sell) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 14px 32px rgba(7, 9, 13, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
