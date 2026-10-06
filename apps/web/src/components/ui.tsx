import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_COLORS } from "@/lib/format";

export function Badge({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <span className={`badge ${STATUS_COLORS[value] ?? "bg-slate-100 text-slate-700"} ${className}`}>{value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-medium leading-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <header className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-[15px] font-medium text-slate-900">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

const ICONS: Record<string, string> = { clock: "◷", hours: "◔", tasks: "☰", check: "✓", pending: "⋯", reject: "✕", sheet: "▤", alert: "!", bill: "◆", percent: "%" };

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "ok" | "warn"; icon?: keyof typeof ICONS }) {
  const ring = tone === "danger" ? "border-rose-200 text-rose-600 dark:border-rose-500/30 dark:text-rose-300" : tone === "ok" ? "border-emerald-200 text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-300" : tone === "warn" ? "border-amber-200 text-amber-600 dark:border-amber-500/30 dark:text-amber-300" : "";
  return (
    <div className="stat">
      <div className={`stat-icon ${ring}`}>{ICONS[icon ?? "clock"]}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="inset p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 inline-flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`rounded-full px-3.5 py-1.5 text-sm transition ${active === t.key ? "bg-white text-slate-900 shadow-card" : "text-slate-600 hover:text-slate-900"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-medium text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}
