---
"@cloudflare/autoconfig": minor
---

Set up the framework after migrating a Wrangler project

After migrating a Wrangler project, `runAutoConfig()` now sets up its framework when autoconfig can set that framework up for cf. When `bundler` isn't set, the migration uses Vite for those frameworks and for projects that declare `@cloudflare/vite-plugin`, and Wrangler otherwise. Framework setup gets the existing Worker entrypoint as `existingWorkerConfig`.
