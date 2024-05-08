---
"wrangler": patch
---

fix: when using custom builds, the `wrangler dev` proxy server was sometimes left in a paused state

This could be observed as the browser loading indefinitely, after saving a source file (unchanged) when using custom builds. This is now fixed by ensuring the proxy server is unpaused after a short timeout period.
