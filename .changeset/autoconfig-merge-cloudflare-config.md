---
"@cloudflare/autoconfig": patch
---

Merge framework setup into an existing `cloudflare.config.ts` instead of overwriting it

When a project already has a `cloudflare.config.ts`, such as one written by `cf migrate`, autoconfig now keeps everything in it. It replaces only the entrypoint that the framework needs, and adds the framework's other settings where they are missing.
