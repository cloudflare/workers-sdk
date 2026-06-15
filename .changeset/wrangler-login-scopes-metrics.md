---
"wrangler": minor
---

Send the `login user` telemetry event when `wrangler login --scopes ...` succeeds

`wrangler login` was already reporting the `login user` event when called without `--scopes`, but the scoped login path returned early before the event could be sent. Both paths now report the event, so successful scoped logins are counted alongside unscoped ones.
