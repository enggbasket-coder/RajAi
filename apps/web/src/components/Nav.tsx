"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; icon: string }

export function Nav({ sections }: { sections: { title: string; items: NavItem[] }[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-5">
      {sections.map((s) => (
        <div key={s.title}>
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.title}</div>
          <div className="space-y-0.5">
            {s.items.map((i) => {
              const active = path === i.href || (i.href !== "/dashboard" && path.startsWith(i.href + "/")) || path === i.href;
              return (
                <Link key={i.href} href={i.href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
                  <span className="w-5 text-center">{i.icon}</span>
                  {i.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
