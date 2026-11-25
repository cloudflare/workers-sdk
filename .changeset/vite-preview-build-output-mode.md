---
"@cloudflare/vite-plugin": patch
---

Load only `.env`, `.env.local` and `.dev.vars` when previewing Build Output that records no mode

This matches `cf deploy`. Build Output from the Vite plugin always records a mode, so it loads the same files as before.
