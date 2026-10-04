import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_COLORS } from "@/lib/format";

export function Badge({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <span className={`badge ${STATUS_COLORS[value] ?? "bg-slate-100 text-slate-700"} ${className}`}>{value.replace(/_/g, " ")}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-[13px] font-semibold tracking-tight text-slate-800">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "ok" | "warn" }) {
  const color = tone === "danger" ? "text-rose-600" : tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
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
    <nav className="mb-4 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`-mb-px border-b-2 px-3 py-2 text-sm ${active === t.key ? "border-brand-600 text-brand-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
