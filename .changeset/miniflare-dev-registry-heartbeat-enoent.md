---
"miniflare": patch
---

Keep `wrangler dev` and Vite dev sessions running when the dev registry entry disappears during a heartbeat

When several dev sessions share the dev registry and the machine wakes from sleep, one session could delete another's registry entry just as that session was refreshing it. The refreshing session then crashed with `ENOENT: no such file or directory, utime '.../registry/<name>'`. It now writes the entry back and keeps running, so other sessions can still reach its Workers.
