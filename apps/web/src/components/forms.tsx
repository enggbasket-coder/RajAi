"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

interface JsonFormProps {
  action: string;
  method?: "POST" | "PATCH" | "DELETE" | "PUT";
  children?: ReactNode;
  submitLabel?: string;
  className?: string;
  redirectTo?: string | ((data: any) => string);
  onSuccess?: (data: any) => void;
  /** Wrap all collected fields under this key (e.g. notificationSettings). */
  nestUnder?: string;
  secondary?: ReactNode;
  confirm?: string;
  successMessage?: string;
  submitClassName?: string;
}

/** Collects named inputs into JSON (checkbox → boolean, number inputs → number, data-array → array) and submits. */
export function JsonForm({ action, method = "POST", children, submitLabel = "Save", className = "", redirectTo, onSuccess, nestUnder, secondary, confirm, successMessage, submitClassName = "btn-primary" }: JsonFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    setOk(null);
    setBusy(true);
    const form = e.currentTarget;
    const data: Record<string, unknown> = {};
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (!el.name) continue;
      if (el.type === "checkbox") {
        if (el.dataset.array !== undefined) {
          const arr = (data[el.name] as unknown[]) ?? [];
          if (el.checked) arr.push(el.value);
          data[el.name] = arr;
        } else data[el.name] = el.checked;
      } else if (el.type === "number") data[el.name] = el.value === "" ? null : Number(el.value);
      else if (el.tagName === "SELECT" && (el as unknown as HTMLSelectElement).multiple) data[el.name] = Array.from((el as unknown as HTMLSelectElement).selectedOptions).map((o) => o.value);
      else if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
      } else data[el.name] = el.value;
    }
    const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (sub?.name) data[sub.name] = sub.value;
    try {
      const res = await fetch(action, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(nestUnder ? { [nestUnder]: data } : data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Request failed (${res.status})`);
        return;
      }
      onSuccess?.(body);
      if (successMessage) setOk(successMessage);
      if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(body) : redirectTo);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      {error ? <p className="mt-3 rounded-sharp bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {ok ? <p className="mt-3 rounded-sharp bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null}
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className={submitClassName} disabled={busy}>
          {busy ? "Working…" : submitLabel}
        </button>
        {secondary}
      </div>
    </form>
  );
}

interface ActionButtonProps {
  action: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  prompt?: { field: string; label: string };
  redirectTo?: string;
  onDone?: (data: any) => void;
}

/** One-click server action (POST) with optional confirm / prompt. */
export function ActionButton({ action, method = "POST", body, children, className = "btn-secondary btn-sm", confirm, prompt, redirectTo, onDone }: ActionButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    let payload = { ...(body ?? {}) };
    if (prompt) {
      const v = window.prompt(prompt.label);
      if (v === null) return;
      payload = { ...payload, [prompt.field]: v };
    }
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(action, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      onDone?.(data);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={run} className={className} disabled={busy}>
        {busy ? "…" : children}
      </button>
      {error ? <span className="mt-1 text-xs text-rose-600">{error}</span> : null}
    </span>
  );
}
