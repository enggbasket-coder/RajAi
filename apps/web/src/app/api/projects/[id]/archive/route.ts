import { z } from "zod";
import { ProjectService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor, params) => {
  const { archived } = await parseBody(req, z.object({ archived: z.boolean().default(true) }));
  return json({ project: await ProjectService.archive(actor, params.id, archived) });
});
