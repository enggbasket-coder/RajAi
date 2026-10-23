/* eslint-disable @next/next/no-img-element -- static SVG from /public, no optimisation needed */
/** PlusBrains attribution shown on every screen of every PlusBrains app. Replace /public/plusbrains.svg with the official logo. */
export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <a href="https://plusbrains.ai" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-900 ${className}`} aria-label="Powered by PlusBrains">
      <span>Powered by</span>
      <img src="/plusbrains.svg" alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-[5px]" />
      <span className="font-medium text-slate-700">PlusBrains</span>
    </a>
  );
}
