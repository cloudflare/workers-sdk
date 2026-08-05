---
"miniflare": patch
---

Stop deleting and recreating every dev registry entry on each config update

Applying options rewrote this instance's dev registry entries by removing them and putting them straight back. Other dev sessions find Workers by watching that directory, so each update briefly looked to them like every Worker in the session had gone away — and a session that had already resolved one of those Workers could be left acting on that, up to and including tearing down a binding to a Worker that never actually stopped running.

Entries are now reconciled instead: Workers that are still present are updated in place, and only the ones that have genuinely gone are removed. Switching to a different registry path still clears the entries from the directory being left behind.
