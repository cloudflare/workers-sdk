---
"miniflare": patch
---

Stop Hyperdrive proxy listeners from accumulating across local development reloads

Miniflare now reuses a listener when a Hyperdrive binding keeps the same target and closes listeners no longer used after a configuration update. Changing or removing a binding, including switching to `sslmode=disable`, no longer leaves stale listening ports in `wrangler dev`.
