import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-9 w-9 rounded-[8px] bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-glow" />
          <div className="text-2xl font-bold tracking-tight text-slate-900">Trackwise</div>
          <div className="text-xs text-slate-500">Assign · Notify · Accept · Track · Approve</div>
        </div>
        <div className="card card-body">{children}</div>
      </div>
    </main>
  );
}
