export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight text-brand-700">Trackwise</div>
          <div className="text-xs text-slate-500">Assign · Notify · Accept · Track · Approve</div>
        </div>
        <div className="card card-body">{children}</div>
      </div>
    </main>
  );
}
