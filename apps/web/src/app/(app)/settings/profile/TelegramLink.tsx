"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TelegramLink({ userId, botUsername }: { userId: string; botUsername: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: string; deepLink: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="text-sm">
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-slate-700">
        <li>Click <em>Connect Telegram</em> to get a one-time code.</li>
        <li>Open {botUsername ? <a className="text-brand-600 underline" href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">@{botUsername}</a> : "the organization bot"} and press <strong>Start</strong>.</li>
        <li>Send <code>/start &lt;code&gt;</code>. Linking completes instantly.</li>
      </ol>
      {code ? (
        <div className="rounded-md bg-sky-50 p-3">
          <div className="text-xs uppercase text-sky-700">Your code (15 min, single use)</div>
          <div className="font-mono text-xl">{code.code}</div>
          <div className="mt-1 text-xs text-slate-600">Send to the bot: <code>/start {code.code}</code></div>
          {code.deepLink ? <a className="btn-primary btn-sm mt-2" href={code.deepLink} target="_blank" rel="noreferrer">Open bot with code</a> : null}
          <button className="btn-secondary btn-sm mt-2 ml-2" onClick={() => router.refresh()}>I&apos;ve linked it</button>
        </div>
      ) : (
        <button
          className="btn-primary btn-sm"
          onClick={async () => {
            setError(null);
            const res = await fetch(`/api/users/${userId}/messaging/telegram/link`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) return setError(data.error);
            setCode(data);
          }}
        >
          Connect Telegram
        </button>
      )}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
