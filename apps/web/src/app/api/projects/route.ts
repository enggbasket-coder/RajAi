import { ProjectService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";
import { projectSchema } from "./schema";

export const GET = withActor(async (req, actor) => json({ projects: await ProjectService.list(actor, { includeArchived: req.nextUrl.searchParams.get("all") === "1", clientId: req.nextUrl.searchParams.get("clientId") ?? undefined }) }));
export const POST = withActor(async (req, actor) => json({ project: await ProjectService.create(actor, await parseBody(req, projectSchema)) }, { status: 201 }));
