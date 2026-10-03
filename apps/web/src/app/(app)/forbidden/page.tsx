import Link from "next/link";
export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  return (
    <div className="card card-body max-w-lg">
      <h1 className="text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-1 text-sm text-slate-600">Your role in this organization does not include {need ? <code>{need}</code> : "the required permission"}. Ask an owner or admin if you need it.</p>
      <Link href="/my-tasks" className="btn-primary mt-4 w-fit">Go to My Tasks</Link>
    </div>
  );
}
