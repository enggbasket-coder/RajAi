import { AssignmentService, ProjectService, TimerService } from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { TimerPanel } from "./TimerPanel";

export const dynamic = "force-dynamic";

export default async function TimerPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  const actor = await requireActor();
  const [assignments, current, org, projects] = await Promise.all([
    AssignmentService.listForUser(actor.organizationId, actor.userId),
    TimerService.current(actor),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    ProjectService.list(actor),
  ]);
  const tasks = assignments.filter((a) => a.status === "ACCEPTED" && a.task.status !== "COMPLETED").map((a) => ({ id: a.taskId, title: a.task.title, project: a.task.project.name, projectId: a.task.projectId }));
  return (
    <>
      <PageHeader title="Timer" subtitle="Server-side timer. Starting another task stops the current one. Only one timer can run per person." />
      <TimerPanel
        tasks={tasks}
        initial={current ? { taskId: current.taskId, taskTitle: current.task.title, projectName: current.project.name, startedAt: current.startedAt.toISOString(), elapsedSeconds: current.elapsedSeconds } : null}
        preselectTaskId={task ?? null}
        manualEnabled={org.manualTimeEnabled}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        idleTimeoutMinutes={org.idleTimeoutMinutes}
      />
    </>
  );
}
