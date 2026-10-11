---
"create-cloudflare": patch
---

Report unsupported Node.js versions clearly when creating Nuxt projects

Before launching nuxi 4, both Nuxt templates check its supported Node.js versions: 22.21.0 or later in the 22.x release line, 24.11.0 or later in the 24.x release line, or 26.0.0 or later. Unsupported versions receive an error showing the required range, the current version, and guidance to upgrade Node.js.
