import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink text-2xl font-semibold text-white">T</span>
          <div className="text-[28px] font-medium tracking-tight text-slate-900">Trackwise</div>
          <div className="mt-1 text-sm text-slate-500">Assign · Notify · Accept · Track · Approve</div>
        </div>
        <div className="card card-body">{children}</div>
      </div>
    </main>
  );
}
