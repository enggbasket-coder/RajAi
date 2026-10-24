"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";

interface Person { userId: string; name: string; role: string; wa: string | null; tg: string | null }
interface Pending { id: string; title: string; userId: string; deliveries: { channel: string; status: string; externalMessageId: string | null }[] }
interface Msg { id: string; at: string; channel: string; direction: string; body: string; status: string; userId: string | null; meta: Record<string, unknown>; externalMessageId: string | null }

export function MockConsole({ people, pending, recent }: { people: Person[]; pending: Pending[]; recent: Msg[] }) {
  const router = useRouter();
  const [provider, setProvider] = useState<"WHATSAPP" | "TELEGRAM">("WHATSAPP");
  const [person, setPerson] = useState(people[0]?.userId ?? "");
  const [text, setText] = useState("1");
  const [log, setLog] = useState<string[]>([]);
  const p = people.find((x) => x.userId === person);
  const from = provider === "WHATSAPP" ? p?.wa : p?.tg;

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setLog((l) => [`${new Date().toLocaleTimeString()} ${JSON.stringify(data)}`, ...l].slice(0, 30));
    router.refresh();
  }
  const simulate = (body: Record<string, unknown>) => post("/api/dev/simulate", { provider, from, ...body });
  const nameOf = (id: string | null) => people.find((x) => x.userId === id)?.name ?? "—";
  const quick = provider === "WHATSAPP" ? ["1", "2", "yes", "no", "maybe", "assign Akhil | EdgeVerve Q2O | Finish Act 2 keyframes | due tomorrow 2pm"] : ["/start", "/assign Akhil | EdgeVerve Q2O | Finish keyframes | due tomorrow 2pm", "yes", "no"];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        <Card title="Simulate inbound">
          <div className="space-y-2 text-sm">
            <div className="flex gap-1">{(["WHATSAPP", "TELEGRAM"] as const).map((x) => <button key={x} className={`btn-sm ${provider === x ? "btn-primary" : "btn-secondary"}`} onClick={() => setProvider(x)}>{x}</button>)}</div>
            <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>{people.map((x) => <option key={x.userId} value={x.userId}>{x.name} ({x.role.toLowerCase()})</option>)}</select>
            <div className="text-xs text-slate-500">From: <code>{from ?? "not linked"}</code></div>
            <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap gap-1">{quick.map((q) => <button key={q} className="btn-secondary btn-sm" onClick={() => setText(q)}>{q.length > 18 ? q.slice(0, 18) + "…" : q}</button>)}</div>
            <button className="btn-primary" disabled={!from} onClick={() => simulate({ kind: "message", text })}>Send as {p?.name}</button>
            <button className="btn-secondary ml-2" onClick={() => simulate({ kind: "message", text, from: provider === "WHATSAPP" ? "+19990000000" : "999000111" })}>Send from unknown sender</button>
          </div>
        </Card>
        <Card title="Provider failure">
          <div className="flex flex-wrap gap-1 text-sm">
            {(["none", "temporary", "permanent"] as const).map((m) => <button key={m} className="btn-secondary btn-sm" onClick={() => post("/api/dev/mock", { provider, mode: m })}>{m}</button>)}
            <button className="btn-secondary btn-sm" onClick={() => post("/api/dev/mock", { provider, failNext: 3 })}>fail next 3</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">“fail next 3” exhausts the retry budget on the next send → delivery FAILED → Retry button on the task page.</p>
        </Card>
        <Card title="Log"><pre className="max-h-64 overflow-auto text-[11px] text-slate-600">{log.join("\n") || "—"}</pre></Card>
      </div>
      <div className="space-y-6 lg:col-span-2">
        <Card title="Pending assignments">
          {pending.length === 0 ? <p className="text-sm text-slate-500">None. Create one from New assignment.</p> : (
            <table className="table">
              <thead><tr><th>Task</th><th>Employee</th><th>Deliveries</th><th>Simulate</th></tr></thead>
              <tbody>
                {pending.map((a) => {
                  const emp = people.find((x) => x.userId === a.userId);
                  const tg = a.deliveries.find((d) => d.channel === "TELEGRAM");
                  const wa = a.deliveries.find((d) => d.channel === "WHATSAPP");
                  const tgMsg = recent.find((m) => m.channel === "TELEGRAM" && m.externalMessageId === tg?.externalMessageId);
                  const buttons = (tgMsg?.meta as { buttons?: string[] })?.buttons;
                  return (
                    <tr key={a.id}>
                      <td className="font-medium">{a.title}</td>
                      <td>{emp?.name}</td>
                      <td>{a.deliveries.map((d) => <span key={d.channel} className="mr-1 inline-flex gap-1"><Badge value={d.channel} /><Badge value={d.status} /></span>)}</td>
                      <td className="space-x-1 whitespace-nowrap">
                        {wa && emp?.wa ? <>
                          <button className="btn-secondary btn-sm" onClick={() => post("/api/dev/simulate", { provider: "WHATSAPP", kind: "status", from: emp.wa, messageId: wa.externalMessageId, status: "delivered" })}>WA delivered</button>
                          <button className="btn-secondary btn-sm" onClick={() => post("/api/dev/simulate", { provider: "WHATSAPP", kind: "status", from: emp.wa, messageId: wa.externalMessageId, status: "read" })}>read</button>
                          <button className="btn-primary btn-sm" onClick={() => post("/api/dev/simulate", { provider: "WHATSAPP", kind: "message", from: emp.wa, text: "1" })}>WA accept</button>
                          <button className="btn-secondary btn-sm" onClick={() => post("/api/dev/simulate", { provider: "WHATSAPP", kind: "message", from: emp.wa, text: "2" })}>WA reject</button>
                        </> : null}
                        {tg && emp?.tg ? <TgButtons assignmentId={a.id} from={emp.tg} buttons={buttons} onPost={post} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Recent messages (from the database)">
          <ul className="divide-y divide-slate-100 text-sm">
            {recent.map((m) => (
              <li key={m.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono">{new Date(m.at).toLocaleTimeString()}</span><Badge value={m.channel} /><span>{m.direction === "INBOUND" ? "⬅ from" : "➡ to"} {nameOf(m.userId)}</span><Badge value={m.status} />
                </div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-800">{m.body}</pre>
                {(m.meta as { buttons?: string[] })?.buttons ? <div className="mt-1 flex gap-1">{((m.meta as { buttons?: string[] }).buttons ?? []).map((b) => <span key={b} className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">{b}</span>)}</div> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TgButtons({ assignmentId, from, onPost }: { assignmentId: string; from: string; buttons?: string[]; onPost: (u: string, b: unknown) => Promise<void> }) {
  // Callback data is signed server-side; fetch the signed refs for this assignment.
  const click = async (which: "acc" | "rej") => {
    const res = await fetch(`/api/dev/callback-ref?assignmentId=${assignmentId}&prefix=${which}`);
    const { data } = await res.json();
    await onPost("/api/dev/simulate", { provider: "TELEGRAM", kind: "callback", from, data });
  };
  return (
    <>
      <button className="btn-primary btn-sm" onClick={() => click("acc")}>TG ✅ Accept</button>
      <button className="btn-secondary btn-sm" onClick={() => click("rej")}>TG ❌ Reject</button>
    </>
  );
}
