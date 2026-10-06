import { MemberService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (req, actor) => json({ members: await MemberService.list(actor, { includeInactive: req.nextUrl.searchParams.get("all") === "1" }) }));
