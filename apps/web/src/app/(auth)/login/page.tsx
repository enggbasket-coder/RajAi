import Link from "next/link";
import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      <JsonForm action="/api/auth/login" submitLabel="Sign in" redirectTo={next || "/dashboard"} className="space-y-3">
        <Field label="Email"><input name="email" type="email" className="input" required autoComplete="email" /></Field>
        <Field label="Password"><input name="password" type="password" className="input" required autoComplete="current-password" /></Field>
      </JsonForm>
      <div className="mt-4 flex justify-between text-sm">
        <Link className="text-brand-600 hover:underline" href="/forgot-password">Forgot password?</Link>
        <Link className="text-brand-600 hover:underline" href="/register">Create an organization</Link>
      </div>
      <p className="mt-4 rounded-sharp bg-slate-50 p-3 text-xs text-slate-500">
        Demo accounts (password <code>password123</code>): owner@, manager@, akhil@, priya@trackwise.demo
      </p>
    </>
  );
}
