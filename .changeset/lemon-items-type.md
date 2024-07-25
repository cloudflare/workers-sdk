---
"wrangler": patch
---

fix: only warn about miniflare feature support (ai, vectorize, cron) once

We have some warnings in local mode dev when trying to use ai bindings / vectorize / cron, but they are printed every time the worker is started. This PR changes the warning to only be printed once per worker start.
