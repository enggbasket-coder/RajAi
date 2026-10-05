/** Appearance system: a colour theme (complete token set, light or dark) × optional Liquid Glass finish.
 *  Everything is CSS tokens — layout and content never change. Persisted in localStorage;
 *  `themeInitScript` applies the saved choice in <head> before first paint (no flash). */

export const THEME_KEY = "tw-theme";
export const GLASS_KEY = "tw-glass";

export type ThemeId = "coral" | "sage" | "ocean" | "slate" | "midnight" | "moss" | "abyss" | "graphite";

export interface Theme {
  id: ThemeId;
  label: string;
  hint: string;
  dark: boolean;
  /** CSS palette family set as data-theme ("" = default family). */
  family: "" | "sage" | "ocean" | "slate";
  /** Preview dots: [canvas, surface, accent]. */
  dots: [string, string, string];
}

export const THEMES: Theme[] = [
  { id: "coral", label: "Coral", hint: "Warm grey canvas, coral accent", dark: false, family: "", dots: ["#ececec", "#ffffff", "#e65d3e"] },
  { id: "sage", label: "Sage", hint: "Cream paper, army green", dark: false, family: "sage", dots: ["#efebe2", "#ffffff", "#395c14"] },
  { id: "ocean", label: "Ocean", hint: "Blue-washed canvas, deep sea accent", dark: false, family: "ocean", dots: ["#e3eff7", "#ffffff", "#07618c"] },
  { id: "slate", label: "Slate", hint: "Cool grey, near-black accent, tight corners", dark: false, family: "slate", dots: ["#eeeff1", "#ffffff", "#191f2a"] },
  { id: "midnight", label: "Midnight", hint: "Deep navy, coral accent", dark: true, family: "", dots: ["#080b12", "#111621", "#f0633f"] },
  { id: "moss", label: "Moss", hint: "Dark forest, lime accent", dark: true, family: "sage", dots: ["#0c100d", "#141a16", "#86b046"] },
  { id: "abyss", label: "Abyss", hint: "Deep sea blue", dark: true, family: "ocean", dots: ["#06121e", "#0a1e30", "#3898d2"] },
  { id: "graphite", label: "Graphite", hint: "Charcoal, ice-white accent", dark: true, family: "slate", dots: ["#0b1220", "#0f172a", "#e2e8f2"] },
];

export const DEFAULT_LIGHT: ThemeId = "coral";
export const DEFAULT_DARK: ThemeId = "midnight";

export function findTheme(id: unknown): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function applyTheme(id: ThemeId) {
  const t = findTheme(id) ?? THEMES[0];
  const el = document.documentElement;
  el.classList.toggle("dark", t.dark);
  if (t.family) el.dataset.theme = t.family;
  else delete el.dataset.theme;
  el.style.colorScheme = t.dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, t.id);
  } catch {
    /* ignore */
  }
}

export function applyGlass(on: boolean) {
  if (on) document.documentElement.dataset.glass = "1";
  else delete document.documentElement.dataset.glass;
  try {
    if (on) localStorage.setItem(GLASS_KEY, "1");
    else localStorage.removeItem(GLASS_KEY);
  } catch {
    /* ignore */
  }
}

export function readAppearance(): { theme: ThemeId; glass: boolean } {
  const el = document.documentElement;
  const dark = el.classList.contains("dark");
  const family = el.dataset.theme ?? "";
  const t = THEMES.find((x) => x.dark === dark && x.family === family) ?? THEMES[0];
  return { theme: t.id, glass: el.dataset.glass === "1" };
}

/** Inline <head> script: applies theme and glass before first paint. Mirrors THEMES above; keep in sync.
 *  Legacy values "light"/"dark" from the old toggle map to the default light/dark themes. */
export const themeInitScript = `(function(){try{var d=document.documentElement,m={coral:[0,''],sage:[0,'sage'],ocean:[0,'ocean'],slate:[0,'slate'],midnight:[1,''],moss:[1,'sage'],abyss:[1,'ocean'],graphite:[1,'slate']},t=localStorage.getItem('${THEME_KEY}');if(t==='light')t='${DEFAULT_LIGHT}';if(t==='dark')t='${DEFAULT_DARK}';if(!m[t]){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'${DEFAULT_DARK}':'${DEFAULT_LIGHT}'}var v=m[t];if(v[0]){d.classList.add('dark');d.style.colorScheme='dark'}if(v[1]){d.setAttribute('data-theme',v[1])}if(localStorage.getItem('${GLASS_KEY}')==='1'){d.setAttribute('data-glass','1')}}catch(e){}})();`;
