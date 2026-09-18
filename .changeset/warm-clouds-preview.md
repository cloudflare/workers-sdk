---
"@cloudflare/build-output-utils": minor
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Pass Preview intent to `defineWorker` and upload its resolved configuration

Preview builds now evaluate programmatic Worker configuration with `ctx.isPreview` set to `true` and record that intent in Build Output. The shared Preview uploader deploys the resolved bindings and settings while preserving configured Preview base values when it creates a Preview.
