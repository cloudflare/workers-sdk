---
"wrangler": patch
---

Stop `wrangler dev` from missing config file changes made soon after a reload

`wrangler dev` replaced its config file watcher on every reload without waiting for the new one to start, so a change saved in that gap was never applied. It now keeps one watcher while the set of watched files is unchanged, and reports a config as applied only once its files are being watched. A second change saved within 50 ms of the previous one is no longer dropped either.
