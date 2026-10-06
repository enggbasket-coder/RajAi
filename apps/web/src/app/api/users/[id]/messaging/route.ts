import { IdentityService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor, params) => json(await IdentityService.list(actor, params.id)));
