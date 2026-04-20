---
"wrangler": minor
---

Rename the documented containers SSH config option to `ssh`

Wrangler now accepts and documents `containers.ssh` in config files while continuing to accept `containers.wrangler_ssh` as an undocumented backwards-compatible alias. Wrangler still sends and reads `wrangler_ssh` when talking to the containers API.
