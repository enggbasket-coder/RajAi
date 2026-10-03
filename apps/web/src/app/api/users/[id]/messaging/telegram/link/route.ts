import { IdentityService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const POST = withActor(async (_req, actor, params) => json(await IdentityService.createTelegramLinkToken(actor, params.id)));
