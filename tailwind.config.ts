import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#e8e8e8",
        paper: "#1d212c",
        panel: "#252a38",
        raised: "#303647",
        line: "#41485b",
        accent: "#8cc63f",
        "accent-dark": "#739c3d",
        bitcoin: "#f7931a",
        mint: "#8cc63f",
        danger: "#ef6b66"
      },
      boxShadow: {
        soft: "0 14px 32px rgba(7, 9, 13, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
