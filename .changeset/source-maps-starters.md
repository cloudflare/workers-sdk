---
"create-cloudflare": patch
---

Enable source maps in JavaScript and TypeScript Worker starter templates

New Worker starters explicitly enable source map uploads so production stack traces and profiles can resolve to original source. Cloudflare Vite starters also explicitly generate external maps for their Worker environments, without enabling browser source maps.

Preserve explicit source map upload opt-outs when updating a generated Wrangler configuration. Existing Wrangler and Vite plugin defaults are unchanged; custom build tools must still emit external maps for Wrangler to upload.
