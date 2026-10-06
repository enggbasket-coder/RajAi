import { ReportService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";
import { filterFromQuery } from "../filter";
export const GET = withActor(async (req, actor) => json(await ReportService.hours(actor, filterFromQuery(req.nextUrl.searchParams))));
