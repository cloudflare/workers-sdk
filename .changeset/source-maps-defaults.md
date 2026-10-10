---
"wrangler": minor
"@cloudflare/vite-plugin": minor
"create-cloudflare": patch
"@cloudflare/autoconfig": minor
---

Enable Worker source maps by default for deployment and scaffolding

Wrangler uploads source maps when deploying or uploading a version unless explicitly disabled with `upload_source_maps: false` or `--no-upload-source-maps`. The Cloudflare Vite plugin generates maps for Worker environments by default without enabling browser source maps. Explicit Vite build settings and Worker upload opt-outs are preserved.

JavaScript and TypeScript starters include source map uploads, and autoconfiguration enables them for existing projects. Custom build tools must still emit external source maps for Wrangler to upload.
