---
"@cloudflare/autoconfig": patch
---

Generate cf configuration without a runtime dependency on cf

Use a type-only import when generating `cloudflare.config.ts`, so static directories without a `package.json` or local cf installation can load their configuration after setup.
