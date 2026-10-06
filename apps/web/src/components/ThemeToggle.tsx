"use client";
import { useEffect, useRef, useState } from "react";
import { THEMES, applyGlass, applyTheme, readAppearance, themeInitScript, type ThemeId } from "@/lib/theme";

export { themeInitScript };

const Dots = ({ dots, size = "h-4 w-4" }: { dots: [string, string, string]; size?: string }) => (
  <span className="inline-flex -space-x-1.5">
    {dots.map((c, i) => <span key={i} className={`${size} rounded-full shadow-[0_0_0_1px_rgb(0_0_0_/_0.12)] ring-2 ring-white`} style={{ background: c }} />)}
  </span>
);

/** Theme picker: a pill showing the current theme's colours; opens a menu of colour themes plus the Liquid Glass toggle.
 *  The initial state is set by the inline script in the root layout, so this only mirrors the document. */
export function ThemeToggle({ compact = true }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeId>("coral");
  const [glass, setGlass] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const a = readAppearance();
      setTheme(a.theme);
      setGlass(a.glass);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-glass"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const group = (dark: boolean) => (
    <>
      <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{dark ? "Dark" : "Light"}</div>
      {THEMES.filter((t) => t.dark === dark).map((t) => {
        const active = t.id === theme;
        return (
          <button key={t.id} type="button" role="menuitemradio" aria-checked={active} onClick={() => applyTheme(t.id)} className={`flex w-full items-center gap-3 rounded-sharp px-2 py-2 text-left transition hover:bg-slate-100 ${active ? "bg-slate-100" : ""}`}>
            <Dots dots={t.dots} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900">{t.label}</span>
              <span className="block truncate text-xs text-slate-500">{t.hint}</span>
            </span>
            {active ? <svg className="h-4 w-4 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg> : null}
          </button>
        );
      })}
    </>
  );

  return (
    <div ref={rootRef} className="relative">
      <button type="button" title={`Theme: ${current.label}${glass ? " · Liquid Glass" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white pl-2.5 pr-3 text-sm text-slate-700 transition hover:bg-slate-50">
        <Dots dots={current.dots} size="h-3.5 w-3.5" />
        <span className={compact ? "hidden sm:inline" : ""}>{current.label}</span>
        <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open ? (
        <div role="menu" aria-label="Theme" className="card theme-menu absolute right-0 z-50 mt-2 w-72 p-2 shadow-frame">
          {group(false)}
          {group(true)}
          <div className="my-2 border-t border-slate-100" />
          <button type="button" role="menuitemcheckbox" aria-checked={glass} onClick={() => applyGlass(!glass)} className="flex w-full items-center gap-3 rounded-sharp px-2 py-2 text-left transition hover:bg-slate-100">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900">Liquid Glass finish</span>
              <span className="block text-xs text-slate-500">Frosted, floating panels over the theme</span>
            </span>
            <span aria-hidden className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${glass ? "bg-accent" : "bg-slate-300"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${glass ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
