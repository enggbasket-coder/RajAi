import { ConnectionService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";
export const GET = withActor(async (_req, actor) => json(await ConnectionService.list(actor)));
