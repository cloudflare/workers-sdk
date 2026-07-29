---
"create-cloudflare": patch
---

Configure experimental projects using `@cloudflare/autoconfig` directly

When scaffolding experimental templates, C3 now runs the autoconfig flow in-process via `@cloudflare/autoconfig` instead of shelling out to `wrangler setup`. This produces the same configuration while making the setup step faster and no longer dependent on the `wrangler` CLI.
