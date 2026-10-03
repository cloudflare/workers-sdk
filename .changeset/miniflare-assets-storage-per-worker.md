---
"miniflare": patch
---

Give each Worker with static assets its own assets storage service

When several Workers with static assets ran in one Miniflare instance, they all registered a disk service named `assets:storage`, so one Worker's asset directory served every Worker's files and the others got 404s. The storage service name now includes the Worker name, like the assets KV and router services already do.
