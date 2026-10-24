import { ProjectService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";
import { projectSchema } from "../schema";

export const GET = withActor(async (_req, actor, params) => json({ project: await ProjectService.get(actor, params.id) }));
export const PATCH = withActor(async (req, actor, params) => json({ project: await ProjectService.update(actor, params.id, await parseBody(req, projectSchema.partial())) }));
