/** PlusBrains credit, rendered natively on every screen (marked data-pb-credit so an injected copy stands down).
 *  Mark: four petals, top-left petal always orange; the rest follow the text colour. Wordmark: "Plus" bold + "Brains" orange italic serif. */
const PETAL = "M4 19A15 15 0 0 1 19 4H23A6 6 0 0 1 29 10V26.5A2.5 2.5 0 0 1 26.5 29H10A6 6 0 0 1 4 23Z";

export function PBMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={className}>
      <path d={PETAL} fill="#FF6A2B" />
      <path d={PETAL} fill="currentColor" transform="rotate(90 32 32)" />
      <path d={PETAL} fill="currentColor" transform="rotate(180 32 32)" />
      <path d={PETAL} fill="currentColor" transform="rotate(270 32 32)" />
    </svg>
  );
}

export function PBWordmark({ size = 12 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-[0.35em] leading-none text-slate-900" style={{ fontSize: size }}>
      <PBMark size={Math.round(size * 1.15)} />
      <span>
        <b className="font-extrabold tracking-[-0.02em]">Plus</b>
        <i className="pb-serif font-normal italic text-[#FF6A2B]" style={{ fontSize: "1.12em" }}>Brains</i>
      </span>
    </span>
  );
}

export function PoweredBy({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <a href="https://plusbrains.ai" target="_blank" rel="noopener noreferrer" data-pb-credit className={`inline-flex items-center gap-1.5 text-[10px] text-slate-500 transition hover:text-slate-900 ${className}`} aria-label="Powered by PlusBrains">
      <span className="opacity-[.65]">Powered by</span>
      <PBWordmark size={size} />
    </a>
  );
}
