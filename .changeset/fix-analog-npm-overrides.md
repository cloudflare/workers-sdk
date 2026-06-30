---
"create-cloudflare": patch
---

Fix npm installs for Analog projects

Analog's generated Vite overrides can cause npm to fail with `Unable to resolve reference $vite` when dependency resolution changes. `create-cloudflare` now opts npm-generated Analog projects out of those overrides so project creation can complete successfully.
