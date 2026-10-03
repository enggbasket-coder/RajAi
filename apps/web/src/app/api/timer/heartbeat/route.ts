import { TimerService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const POST = withActor(async (_req, actor) => json({ at: await TimerService.heartbeat(actor) }));
