---
"@cloudflare/autoconfig": patch
---

Merge framework setup into an existing `cloudflare.config.ts` instead of overwriting it

When a project already has a `cloudflare.config.ts`, such as one written by `cf migrate`, autoconfig now keeps everything in it and only sets the values the framework setup needs, such as its entrypoint. The existing Worker name and compatibility date are kept.
