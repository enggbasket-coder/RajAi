import { TaskService, notifyTaskCompleted } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const POST = withActor(async (_req, actor, params) => {
  const task = await TaskService.complete(actor, params.id);
  await notifyTaskCompleted(task.id, actor.userId);
  return json({ task });
});
