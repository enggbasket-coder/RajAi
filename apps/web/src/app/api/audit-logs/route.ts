import { AuditService, requirePermission } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (req, actor) => {
  requirePermission(actor, "audit:read");
  const q = req.nextUrl.searchParams;
  return json({ logs: await AuditService.list(actor.organizationId, { action: q.get("action") ?? undefined, entityType: q.get("entityType") ?? undefined, cursor: q.get("cursor") ?? undefined, limit: Number(q.get("limit") ?? 100) }) });
});
