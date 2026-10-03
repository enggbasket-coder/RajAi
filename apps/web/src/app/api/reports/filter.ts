export function filterFromQuery(q: URLSearchParams) {
  return { from: q.get("from") ? new Date(q.get("from")!) : undefined, to: q.get("to") ? new Date(q.get("to")!) : undefined, userId: q.get("userId") || undefined, projectId: q.get("projectId") || undefined, clientId: q.get("clientId") || undefined, status: (q.get("status") as never) || undefined };
}
