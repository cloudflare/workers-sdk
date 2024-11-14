---
"wrangler": minor
---

Adds [observability.logs] settings to wrangler. This setting lets developers control the settings for logs as an independent dataset enabling more dataset types in the future. The most specific setting will win if any of the datasets are not enabled.

It also adds the following setting to the logs config

- `invocation_logs` - set to false to disable invocation logs. Defaults to true.

```toml
[observability.logs]
enabled = true
invocation_logs = false
```
