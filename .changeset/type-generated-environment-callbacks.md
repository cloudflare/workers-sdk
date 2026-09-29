---
"@cloudflare/codemods": minor
---

Fix generated cf configuration callback types for environments and Previews

The experimental migration now annotates Cloudflare configuration callbacks with a type-only CloudflareConfig import. Configurations with different binding names across branches pass strict TypeScript checking while invalid configuration values remain type errors. Static configuration exports and Wrangler tooling callbacks are unchanged.
