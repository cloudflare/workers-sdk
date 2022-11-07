---
"wrangler": patch
---

fix: use XDG PATH for metrics config

Use `getGlobalWranglerConfigPath` to get the config directory
which previously added support for XDG Paths.

resolves #2075
