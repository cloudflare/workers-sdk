---
"wrangler": patch
---

feature: allow user to select a handler template with `wrangler init`

This allows the user to choose which template they'd like to use when they are prompted to create a new worker.
The options are currently "None"/"Fetch Handler"/"Scheduled Handler".
Support for new handler types such as `email` can be added easily in future.
