---
"create-cloudflare": patch
---

Update SolidStart template for compatibility with v2.

SolidStart v2 uses the `nitro` Vite plugin so we now update the Nitro config in `vite.config.ts` rather than `app.config.ts`.
