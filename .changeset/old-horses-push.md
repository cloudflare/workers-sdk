---
"wrangler": minor
---

feat: allow for Pages projects to upload sourcemaps

Pages projects can now upload sourcemaps for server bundles to enable remapped stacktraces in realtime logs when deployed with `upload_source_map` set to `true` in `wrangler.toml`.
