---
"wrangler": minor
---

Add ProxyCommand support for `wrangler containers ssh`

`wrangler containers ssh` now automatically switches to a stdio proxy when invoked by OpenSSH's `ProxyCommand`, and `--stdio` can force this mode. This lets users connect with `ssh <instance_id>` when their SSH config uses Wrangler as the proxy command.
