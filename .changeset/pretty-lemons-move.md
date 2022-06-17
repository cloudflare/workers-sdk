---
"wrangler": patch
---

feat: entry point is not mandatory if `--assets` is passed

Since we use a facade worker with `--assets`, an entry point is not strictly necessary. This makes a common usecase of "deploy a bunch of static assets" extremely easy to start, as a one liner `npx wrangler dev --assets path/to/folder` (and same with `publish`).
