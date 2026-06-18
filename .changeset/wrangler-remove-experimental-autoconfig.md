---
"wrangler": minor
---

Remove experimental autoconfig exports

The experimental autoconfig exports (`experimental_getDetailsForAutoConfig`, `experimental_runAutoConfig`, `experimental_AutoConfigFramework`) have been removed. This logic has been moved to the `@cloudflare/autoconfig` package (without the `experimental_` prefixes since the package itself is pre-v1).
