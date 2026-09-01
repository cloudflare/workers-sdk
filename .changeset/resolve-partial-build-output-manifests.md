---
"@cloudflare/build-output-utils": minor
"@cloudflare/config": minor
---

Support partial manifests in the experimental Build Output Specification

Build output producers now declare whether their module inventory is complete. `readBuildOutput()` resolves partial manifests by discovering `.js`, `.mjs`, and `.map` files while preserving explicit module type overrides.
