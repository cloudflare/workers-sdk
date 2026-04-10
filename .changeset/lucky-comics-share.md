---
"@cloudflare/vite-plugin": patch
---

Harden file serving for Vite dev

The Vite plugin now includes Wrangler config files and `.wrangler` state files in `server.fs.deny` so they cannot be fetched directly from the Vite dev server.
