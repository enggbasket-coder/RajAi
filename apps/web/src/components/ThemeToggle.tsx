"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "tw-theme";

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Circular light/dark switch. The initial class is set by the inline script in the root layout to avoid a flash. */
export function ThemeToggle({ compact = true }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  const set = (t: Theme) => {
    apply(t);
    setTheme(t);
  };
  const seg = (active: boolean) => `inline-flex h-8 w-8 items-center justify-center rounded-full transition ${active ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900" : "text-slate-500 hover:text-slate-900"}`;
  return (
    <div role="group" aria-label="Theme" className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5">
      <button type="button" title="Dark mode" aria-pressed={theme === "dark"} onClick={() => set("dark")} className={seg(theme === "dark")}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      </button>
      <button type="button" title="Light mode" aria-pressed={theme === "light"} onClick={() => set("light")} className={seg(theme === "light")}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      </button>
      {compact ? null : <span className="px-2 text-xs text-slate-600">{theme === "dark" ? "Dark" : "Light"}</span>}
    </div>
  );
}

export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;
