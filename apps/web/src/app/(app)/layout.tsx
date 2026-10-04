import Link from "next/link";
import { listMemberships } from "@trackwise/auth";
import { isAdminLike, isManagerial } from "@trackwise/rbac";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { Heartbeat } from "@/components/Heartbeat";
import { Nav, type NavItem } from "@/components/Nav";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const memberships = await listMemberships(actor.userId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const managerial = isManagerial(actor.role);
  const admin = isAdminLike(actor.role);
  const devTools = process.env.ENABLE_DEV_TOOLS === "true";

  const work: NavItem[] = [
    ...(managerial ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/my-tasks", label: "My Tasks" },
    { href: "/timer", label: "Timer" },
    { href: "/timesheets/daily", label: "Daily" },
    { href: "/timesheets/weekly", label: "Weekly" },
  ];
  const manage: NavItem[] = managerial
    ? [
        { href: "/tasks", label: "Tasks" },
        { href: "/tasks/new", label: "New assignment" },
        { href: "/projects", label: "Projects" },
        { href: "/clients", label: "Clients" },
        { href: "/live-team", label: "Live Team" },
        { href: "/approvals", label: "Approvals" },
        { href: "/reports", label: "Reports" },
      ]
    : [{ href: "/reports", label: "My reports" }];
  const settings: NavItem[] = [
    { href: "/settings/account", label: "My account" },
    { href: "/settings/profile", label: "My messaging" },
    ...(managerial ? [{ href: "/members", label: "Members" }] : []),
    ...(admin
      ? [
          { href: "/settings/messaging", label: "Messaging" },
          { href: "/settings/organization", label: "Organization" },
          { href: "/audit-log", label: "Audit log" },
          ...(devTools ? [{ href: "/dev/messaging", label: "Mock console" }] : []),
        ]
      : []),
  ];
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: org.timezone, day: "numeric" }).format(now);
  const dateLabel = `${new Intl.DateTimeFormat("en-GB", { timeZone: org.timezone, weekday: "short" }).format(now)}, ${new Intl.DateTimeFormat("en-GB", { timeZone: org.timezone, month: "long" }).format(now)}`;

  return (
    <div className="min-h-screen p-3 md:p-5">
      <Heartbeat />
      <div className="frame mx-auto max-w-[1540px] overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 md:px-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white dark:text-[#0a0e17]">T</span>
              <span className="leading-tight">
                <span className="block text-base font-medium text-slate-900">Trackwise</span>
                <span className="block text-sm text-slate-500">{org.name}</span>
              </span>
            </Link>
            <div className="hidden md:block"><OrgSwitcher current={actor.organizationId} organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name }))} /></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-full border border-slate-200 py-1 pl-1 pr-4 lg:flex">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-900">{day}</span>
              <span className="text-sm text-slate-600">{dateLabel}</span>
            </div>
            <ThemeToggle />
            <div className="flex items-center gap-3 rounded-full border border-slate-200 py-1 pl-1 pr-4">
              <Link href="/settings/account" className="flex items-center gap-3" title="My account">
              <Avatar name={actor.user.name} size={36} />
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-medium text-slate-900">{actor.user.name}</span>
                <span className="block text-xs capitalize text-slate-500">{actor.role.toLowerCase()}</span>
              </span>
              </Link>
              <a href="/api/auth/logout" className="ml-1 text-xs text-slate-400 hover:text-slate-700">Sign out</a>
            </div>
          </div>
        </header>
        <div className="px-6 pb-4 pt-4 md:px-8">
          <Nav sections={[{ title: "Work", items: work }, { title: managerial ? "Manage" : "Insights", items: manage }, { title: "Settings", items: settings }]} />
        </div>
        <main className="rounded-t-frame bg-slate-50 px-6 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
