# Trackwise — repository guidance for Claude

## PlusBrains branding (applies to every app PlusBrains builds)
- Every screen must carry the "Powered by PlusBrains" attribution with the PlusBrains logo, linking to https://plusbrains.ai.
- In this repo it is the `PoweredBy` component (`apps/web/src/components/PoweredBy.tsx`), rendered in the app layout footer and the auth layout, and the `.powered` footer in the Electron renderer. Keep it on any new layout, standalone page (e.g. error, invite, public pages) and the desktop agent.
- The logo file is `apps/web/public/plusbrains.svg`. Replace it with the official asset when provided; keep the filename so nothing else changes.
- Client-facing AI features are named "PlusBrains AI Bot"; never expose model or vendor names to the browser.

## Conventions
- pnpm monorepo; run `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` and `pnpm --filter @trackwise/web build` before pushing.
- Never log or commit secrets; provider tokens never reach the browser.
