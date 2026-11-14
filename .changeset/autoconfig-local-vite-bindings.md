---
"@cloudflare/autoconfig": patch
---

Keep bindings local by default in Vite configurations generated for cf

Configure `cloudflare({ remoteBindings: false })` when setting up Vite, React Router, TanStack Start, and SolidStart projects for cf. This preserves local development when cf runs Vite directly instead of using the internal `cf-vite --local` delegate. Wrangler configuration and existing user-supplied plugin options are unchanged.
