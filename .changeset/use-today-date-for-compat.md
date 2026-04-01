---
"create-cloudflare": patch
"wrangler": patch
---

Use today's date as the default compatibility date

Previously, when generating a compatibility date for new projects or when no compatibility date was configured, the date was resolved by loading the locally installed `workerd` package via `miniflare`. This approach was unreliable in some package manager environments (notably `pnpm`). The logic now simply uses today's date instead, which is always correct and works reliably across all environments.
