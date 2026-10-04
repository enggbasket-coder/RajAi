import Link from "next/link";
import { listMemberships } from "@trackwise/auth";
import { isAdminLike, isManagerial } from "@trackwise/rbac";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { Heartbeat } from "@/components/Heartbeat";
import { Nav, type NavItem } from "@/components/Nav";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { Badge } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const memberships = await listMemberships(actor.userId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const managerial = isManagerial(actor.role);
  const admin = isAdminLike(actor.role);
  const devTools = process.env.ENABLE_DEV_TOOLS === "true";

  const work: NavItem[] = [
    ...(managerial ? [{ href: "/dashboard", label: "Dashboard", icon: "◫" }] : []),
    { href: "/my-tasks", label: "My Tasks", icon: "☑" },
    { href: "/timer", label: "Timer", icon: "⏱" },
    { href: "/timesheets/daily", label: "Daily timesheet", icon: "▤" },
    { href: "/timesheets/weekly", label: "Weekly timesheet", icon: "▦" },
  ];
  const manage: NavItem[] = managerial
    ? [
        { href: "/tasks", label: "Tasks", icon: "≣" },
        { href: "/tasks/new", label: "New assignment", icon: "＋" },
        { href: "/projects", label: "Projects", icon: "▣" },
        { href: "/clients", label: "Clients", icon: "◈" },
        { href: "/live-team", label: "Live Team", icon: "●" },
        { href: "/approvals", label: "Approvals", icon: "✓" },
        { href: "/reports", label: "Reports", icon: "▥" },
      ]
    : [{ href: "/reports", label: "My reports", icon: "▥" }];
  const settings: NavItem[] = [
    { href: "/settings/profile", label: "My messaging", icon: "✉" },
    ...(managerial ? [{ href: "/members", label: "Members", icon: "👥" }] : []),
    ...(admin
      ? [
          { href: "/settings/messaging", label: "Messaging settings", icon: "⚙" },
          { href: "/settings/organization", label: "Organization", icon: "🏢" },
          { href: "/audit-log", label: "Audit log", icon: "▤" },
          ...(devTools ? [{ href: "/dev/messaging", label: "Mock console", icon: "🧪" }] : []),
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <Heartbeat />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white/80 px-3 py-4 backdrop-blur md:flex">
        <div className="mb-4 px-3">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
              <span className="inline-block h-5 w-5 rounded-[5px] bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-glow" />
              Trackwise
            </Link>
            <ThemeToggle compact />
          </div>
          <div className="mt-2">
            <OrgSwitcher current={actor.organizationId} organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name }))} />
          </div>
        </div>
        <Nav sections={[{ title: "Work", items: work }, { title: managerial ? "Manage" : "Insights", items: manage }, { title: "Settings", items: settings }]} />
        <div className="mt-auto border-t border-slate-100 px-3 pt-3 text-xs text-slate-500">
          <div className="truncate font-medium text-slate-700">{actor.user.name}</div>
          <div className="truncate">{actor.user.email}</div>
          <div className="mt-1 flex items-center justify-between">
            <Badge value={actor.role} />
            <a href="/api/auth/logout" className="hover:underline">Sign out</a>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">TZ {org.timezone}</div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 md:p-8">
        <div className="mb-4 flex items-center justify-end md:hidden"><ThemeToggle /></div>
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
