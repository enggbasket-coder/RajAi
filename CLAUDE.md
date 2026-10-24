# Trackwise — repository guidance for Claude

## PlusBrains branding (applies to every app PlusBrains builds)
- Follow the `plusbrains-branding` skill: a small "Powered by PlusBrains" credit with the four-petal mark (top-left petal orange #FF6A2B, other petals currentColor) and the wordmark "Plus" bold + "Brains" orange Instrument Serif italic, marked `data-pb-credit`, linking to https://plusbrains.ai. Never recolour the petal or "Brains"; never replace the app's own name or logo.
- Trackwise has no sidebar, so the credit is centred at the bottom of every page and under the sign-in card. It is the `PoweredBy` component (`apps/web/src/components/PoweredBy.tsx`, also exports `PBMark`/`PBWordmark`) in the app and auth layouts, and the `.pb-credit` footer in the Electron renderer. Keep it on any new layout or standalone page. If a sidebar is ever added, pin it under the user/sign-out row instead.
- `apps/web/public/plusbrains.svg` is the mark for favicons/exports. Exports (CSV/PDF/Excel) carry "Prepared with PlusBrains AI · Trackwise · <date>".
- Client-facing AI features are named "PlusBrains AI Bot"; never expose model or vendor names to the browser.

## Conventions
- pnpm monorepo; run `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` and `pnpm --filter @trackwise/web build` before pushing.
- Never log or commit secrets; provider tokens never reach the browser.
