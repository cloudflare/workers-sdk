---
"miniflare": patch
---

Keep `wrangler dev` and Vite dev sessions registered when the dev registry entry disappears during a heartbeat

When several dev sessions share the dev registry and the machine wakes from sleep, one session could delete another's registry entry just as that session was refreshing it. Depending on the moment, the refreshing session either crashed with `ENOENT: no such file or directory, utime '.../registry/<name>'` or silently stopped advertising its Worker. It now writes the entry back and keeps running, so other sessions can still reach its Workers.

The entry is written back only if the name is still free. If another session registers a Worker with the same name in the meantime, its entry is left in place instead of being overwritten.
