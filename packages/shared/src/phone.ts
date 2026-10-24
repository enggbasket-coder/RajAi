/**
 * Normalize a phone number to E.164 (+<country><number>).
 * Deterministic, no external data. Returns null if it cannot be normalized safely.
 * defaultCountryCode is a numeric calling code such as "91" used for national-format input.
 */
export function normalizePhone(input: string, defaultCountryCode?: string): string | null {
  if (!input) return null;
  let s = input.trim();
  if (s.startsWith("00")) s = "+" + s.slice(2);
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }
  // WhatsApp sends wa_id without "+" but already including the country code.
  if (digits.length >= 11 && digits.length <= 15) return "+" + digits;
  if (defaultCountryCode) {
    const cc = defaultCountryCode.replace(/\D/g, "");
    const national = digits.replace(/^0+/, "");
    const full = cc + national;
    if (full.length >= 8 && full.length <= 15) return "+" + full;
  }
  return null;
}

export function maskPhone(e164: string): string {
  if (!e164 || e164.length < 6) return e164;
  const keep = 4;
  return e164.slice(0, 3) + "•".repeat(Math.max(0, e164.length - 3 - keep)) + e164.slice(-keep);
}
