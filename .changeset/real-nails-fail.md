---
"wrangler": patch
---

Added `--inspect` option to Pages dev, this can be used to disable the Node.js inspector which backs dev tools.
Made sure to surface Miniflare errors incase it starts to fail.
Changed the default log level for Pages dev to `info` from `error`.