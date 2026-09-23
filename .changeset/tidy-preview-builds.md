---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Support Preview builds through `CLOUDFLARE_PREVIEW_BUILD` environment variable when using the experimental config

Framework-owned build commands can now preserve Preview build context while producing Cloudflare Build Output. The internal Vite and Wrangler delegates consume the same environment variable instead of requiring a delegate-specific `--preview` flag.
