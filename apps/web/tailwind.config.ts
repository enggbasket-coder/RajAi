import type { Config } from "tailwindcss";

/** Semantic palette driven by CSS variables so the whole app flips between light and dark with one class. */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: v("--c-surface"),
        slate: {
          50: v("--c-s50"),
          100: v("--c-s100"),
          200: v("--c-s200"),
          300: v("--c-s300"),
          400: v("--c-s400"),
          500: v("--c-s500"),
          600: v("--c-s600"),
          700: v("--c-s700"),
          800: v("--c-s800"),
          900: v("--c-s900"),
        },
        brand: { 50: v("--c-brand50"), 100: v("--c-brand100"), 500: v("--c-accent"), 600: v("--c-accent"), 700: v("--c-accent-deep") },
        accent: { DEFAULT: v("--c-accent"), deep: v("--c-accent-deep"), soft: v("--c-brand50") },
        ink: v("--c-ink"),
        "on-ink": v("--c-on-ink"),
        "on-accent": v("--c-on-accent"),
        canvas: v("--c-canvas"),
        surface: v("--c-surface"),
      },
      borderRadius: { sharp: "var(--r-sharp)", card: "var(--r-card)", frame: "var(--r-frame)" },
      boxShadow: {
        card: "var(--shadow-card)",
        frame: "var(--shadow-frame)",
        glow: "0 10px 30px -12px rgb(var(--c-accent) / 0.55)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
