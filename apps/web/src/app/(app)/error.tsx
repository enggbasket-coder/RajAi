"use client";
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card card-body max-w-lg">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-600">{error.message || "Unexpected error"}</p>
      <button className="btn-secondary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
