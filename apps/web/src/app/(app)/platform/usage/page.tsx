import Link from "next/link";
import { redirect } from "next/navigation";
import { UsageService, currentMonth, isPlatformAdmin, sharedWhatsAppInfo } from "@trackwise/core";
import { requireActor } from "@/lib/session";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function PlatformUsage({ searchParams }: { searchParams: Promise<{ month?: string; rate?: string }> }) {
  const actor = await requireActor();
  if (!isPlatformAdmin(actor.user.email)) redirect("/forbidden");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const rate = sp.rate !== undefined && sp.rate !== "" && Number.isFinite(Number(sp.rate)) ? Number(sp.rate) : undefined;
  const report = await UsageService.whatsappMonthly(month, { rate });
  const shared = sharedWhatsAppInfo();
  const label = new Date(report.from).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const q = (m: string) => `/platform/usage?month=${m}${rate !== undefined ? `&rate=${rate}` : ""}`;
  const money = (n: number) => `${report.currency === "INR" ? "₹" : report.currency + " "}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <>
      <PageHeader
        title="WhatsApp usage by organization"
        subtitle={<>Platform view · {shared.configured ? <>shared number <strong>{shared.displayName}</strong>{shared.displayPhoneNumber ? ` (${shared.displayPhoneNumber})` : ""}</> : "no shared number configured"} · conversations follow Meta&apos;s 24-hour rule</>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={q(shiftMonth(month, -1))} className="btn-secondary btn-sm">‹ Previous</Link>
            <span className="text-sm font-medium text-slate-900">{label}</span>
            <Link href={q(shiftMonth(month, 1))} className="btn-secondary btn-sm">Next ›</Link>
            <a href={`/api/platform/usage.csv?month=${month}${rate !== undefined ? `&rate=${rate}` : ""}`} className="btn-primary btn-sm">Export CSV</a>
          </div>
        }
      />
      <Card title="Usage">
        <p className="mb-3 text-xs text-slate-500">Estimated at <strong>{money(report.ratePerConversation)}</strong> per conversation. Set <code>WHATSAPP_CONVERSATION_RATE</code> in the environment or add <code>?rate=0.6</code> to this page. Meta&apos;s invoice remains the source of truth.</p>
        {report.rows.length === 0 ? (
          <Empty>No WhatsApp traffic this month. Messages appear here as organizations assign tasks over WhatsApp.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Organization</th><th className="text-right">Sent</th><th className="text-right">Delivered</th><th className="text-right">Failed</th><th className="text-right">Replies</th><th className="text-right">People</th><th className="text-right">Conversations</th><th className="text-right">Estimated cost</th></tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.organizationId}>
                  <td className="font-medium text-slate-900">{r.organizationName}</td>
                  <td className="text-right tabular-nums">{r.outbound}</td>
                  <td className="text-right tabular-nums">{r.delivered}</td>
                  <td className="text-right tabular-nums">{r.failed ? <span className="text-rose-600">{r.failed}</span> : 0}</td>
                  <td className="text-right tabular-nums">{r.inbound}</td>
                  <td className="text-right tabular-nums">{r.recipients}</td>
                  <td className="text-right tabular-nums font-medium">{r.conversations}</td>
                  <td className="text-right tabular-nums">{money(r.estimatedCost)}</td>
                </tr>
              ))}
              <tr className="font-medium text-slate-900">
                <td>Total</td>
                <td className="text-right tabular-nums">{report.totals.outbound}</td>
                <td className="text-right tabular-nums">{report.totals.delivered}</td>
                <td className="text-right tabular-nums">{report.totals.failed}</td>
                <td className="text-right tabular-nums">{report.totals.inbound}</td>
                <td className="text-right tabular-nums">{report.totals.recipients}</td>
                <td className="text-right tabular-nums">{report.totals.conversations}</td>
                <td className="text-right tabular-nums">{money(report.totals.estimatedCost)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
