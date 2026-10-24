"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; icon?: string }

/** Pill navigation rendered inside the frame header, grouped with light dividers. */
export function Nav({ sections }: { sections: { title: string; items: NavItem[] }[] }) {
  const path = usePathname();
  // Highlight only the most specific matching item (so /tasks/new lights "New assignment", not "Tasks").
  const all = sections.flatMap((s) => s.items.map((i) => i.href));
  const best = all.filter((h) => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === best;
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {sections.map((s, i) => (
        <div key={s.title} className="flex flex-wrap items-center gap-1">
          {i > 0 ? <span className="mr-3 hidden h-5 w-px bg-slate-200 md:inline-block" /> : null}
          <span className="mr-1 hidden text-[11px] font-medium uppercase tracking-wider text-slate-400 lg:inline">{s.title}</span>
          {s.items.map((it) => (
            <Link key={it.href} href={it.href} className={`nav-link ${isActive(it.href) ? "nav-link-active" : ""}`}>
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
