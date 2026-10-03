import { DashboardService } from "@trackwise/core";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { LiveTeamTable } from "./LiveTeamTable";

export const dynamic = "force-dynamic";

export default async function LiveTeamPage() {
  const actor = await requireActor();
  const team = await DashboardService.liveTeam(actor);
  return (
    <>
      <PageHeader title="Live Team" subtitle="Presence from a heartbeat every ~45s; offline after 90s without one. Refreshes automatically." />
      <LiveTeamTable initial={team.map((t) => ({ ...t, lastSeenAt: t.lastSeenAt?.toISOString() ?? null }))} />
    </>
  );
}
