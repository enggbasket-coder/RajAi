import { MessagingService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (req, actor, params) => json({ timeline: await MessagingService.timeline(actor, params.id, (req.nextUrl.searchParams.get("filter") as never) ?? "ALL") }));
