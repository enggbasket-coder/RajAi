import { ReportService } from "@trackwise/core";
import { withActor } from "@/lib/api";
import { filterFromQuery } from "../filter";

export const GET = withActor(async (req, actor) => {
  const csv = await ReportService.exportCsv(actor, filterFromQuery(req.nextUrl.searchParams));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="trackwise-hours-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
