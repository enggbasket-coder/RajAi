import type { Config } from "tailwindcss";

/** Semantic palette driven by CSS variables so the whole app flips between light and dark with one class. */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Existing utilities (bg-white, text-slate-600, border-slate-200, …) are remapped to theme tokens,
        // so every page follows the toggle without per-element dark: classes.
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
        brand: { 50: v("--c-brand50"), 100: v("--c-brand100"), 500: v("--c-brand500"), 600: v("--c-brand600"), 700: v("--c-brand700") },
        canvas: v("--c-canvas"),
        surface: v("--c-surface"),
        line: v("--c-line"),
      },
      borderRadius: { sharp: "4px" },
      boxShadow: {
        card: "var(--shadow-card)",
        glow: "0 0 0 1px rgb(var(--c-brand500) / 0.35), 0 8px 30px -12px rgb(var(--c-brand500) / 0.45)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
