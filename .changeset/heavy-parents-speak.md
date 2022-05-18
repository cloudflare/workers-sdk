---
"wrangler": patch
---

feat: Routes in Preview Worker
Add all collected routes from config and args to the preview session when generating a remote worker.
This also matches legacy behavior in wrangler1 in handling routes when generating a preview worker.
