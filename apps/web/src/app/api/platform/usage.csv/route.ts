import { UsageService, currentMonth, isPlatformAdmin } from "@trackwise/core";
import { forbidden } from "@trackwise/shared";
import { withActor } from "@/lib/api";

export const GET = withActor(async (req, actor) => {
  if (!isPlatformAdmin(actor.user.email)) throw forbidden("Platform administrators only");
  const sp = req.nextUrl.searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : currentMonth();
  const rateRaw = sp.get("rate");
  const rate = rateRaw && Number.isFinite(Number(rateRaw)) ? Number(rateRaw) : undefined;
  const report = await UsageService.whatsappMonthly(month, { rate });
  return new Response(UsageService.toCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="trackwise-whatsapp-usage-${month}.csv"` } });
});
