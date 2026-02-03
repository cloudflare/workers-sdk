---
"@cloudflare/workers-utils": patch
---

Fix miniflare resolution when getting local workerd compatibility date

Previously, `getLocalWorkerdCompatibilityDate()` resolved `miniflare` to its main entry point, which could be a nested file deep in the package. This caused module resolution issues when subsequently requiring `workerd` from that location. Now resolves `miniflare/package.json` instead, ensuring consistent resolution from the package root.
