import { TimerService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor) => {
  const t = await TimerService.current(actor);
  return json({ timer: t ? { id: t.id, taskId: t.taskId, taskTitle: t.task.title, projectId: t.projectId, projectName: t.project.name, clientName: t.project.client?.name ?? null, startedAt: t.startedAt, elapsedSeconds: t.elapsedSeconds, source: t.source } : null, serverTime: new Date() });
});
