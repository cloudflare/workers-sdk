---
"@cloudflare/cli-shared-helpers": minor
---

Add new visual-style helpers to `@cloudflare/cli-shared-helpers`.

This change is mostly additive: a new `format` module of prefix-symbol status helpers, a new `box` module of boxen-based message panels, and `isCI`/`supportsColor` helpers added to the existing `interactive` module. The only in-place change is that `colors.ts`'s `brandColor` now uses Cloudflare's official Tangerine orange (`#F6821F`, PMS 1495 C — per Cloudflare's brand guidelines) rather than the previous darker `#BD5B08`.

New exports:

- `@cloudflare/cli-shared-helpers/format` — `success`, `error`, `warning`, `info`, `hint`, `listItem`, `sectionHeader`, `labelValue`, `command`. Each returns a single-line prefix-symbol string for downstream packages to print.
- `@cloudflare/cli-shared-helpers/box` — `errorBox`, `warningBox`, `successBox`, `infoBox`, `brandBox`, `createBox`. Boxen wrappers with rounded borders and semantic colors.
- `isCI` and `supportsColor` added to `@cloudflare/cli-shared-helpers/interactive` next to the existing `isInteractive`.

The legacy gutter-style helpers in the root export (`shapes`, `status`, `startSection`, `endSection`, `updateStatus`, `cancel`, `crash`, `success`, `warn`, `error`) are unchanged and continue to work; they will be replaced in a later phase of the migration once consumers migrate.
