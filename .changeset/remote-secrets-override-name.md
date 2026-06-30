---
"wrangler": patch
---

Fix the remote secrets override check during deploy targeting the wrong Worker when `--name` is passed

The check that warns when a config value would override an existing remote secret was using the Worker name from the config file rather than the resolved name. If you passed `--name <other-worker>`, the check ran against the config-file Worker name instead of the Worker actually being uploaded.
