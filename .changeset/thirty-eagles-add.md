---
"wrangler": patch
---

bugfix: Allow route setting to be `""`
Previously Wrangler1 behavior had allowed for `route = ""`. To keep parity it will be possible to set `route = ""` in the config file and represent not setting a route, while providing a warning.

resolves #1329
