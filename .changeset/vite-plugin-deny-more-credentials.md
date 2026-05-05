---
"@cloudflare/vite-plugin": patch
---

Deny additional credential files from the Vite dev server

The Cloudflare Vite plugin now adds `.npmrc`, `.yarnrc`, `.yarnrc.yml`, and more certificate and key file extensions to `server.fs.deny`. This prevents common credential files from being fetched directly during local development.
