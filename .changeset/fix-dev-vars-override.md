---
"wrangler": patch
---

Fix an issue where `wrangler dev` would not override config `vars` with values from `.dev.vars` during local development when the `secrets` field was defined in the configuration file.
