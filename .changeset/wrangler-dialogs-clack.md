---
"wrangler": minor
---

Migrate wrangler's interactive prompts to `@clack/prompts`, aligning the visual style with create-cloudflare. The autoconfig flow now uses a sectioned wizard layout where the gutter (`│`) threads through detected project settings, prompts, and operation summary blocks.

Wrangler's `confirm`/`prompt`/`select`/`multiselect` helpers in `src/dialogs.ts` keep their existing API; only the rendering engine changes. Wrangler's banner is also routed through cli-shared-helpers' generalised `printBanner`, with an optional `write` hook so it continues to flow through wrangler's `logger`.
