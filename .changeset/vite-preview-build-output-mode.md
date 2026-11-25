---
"@cloudflare/vite-plugin": patch
---

Load only mode-independent local env files when previewing Build Output that records no mode

Previously, preview fell back to Vite's mode (`production` by default) and also loaded files such as `.env.production` and `.dev.vars.production`. Preview now uses only `.env`, `.env.local` and `.dev.vars`, matching how `cf deploy` treats the same Build Output.
