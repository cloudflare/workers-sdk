---
"wrangler": minor
---

Support temporary event accounts in R2 and Containers commands

`wrangler r2` and `wrangler containers` commands now accept the hidden `--temporary` flag, so accounts created for an event can manage buckets, objects and containers directly. Every command that supports `--temporary` now also accepts a hidden `--event-code` flag, so the first command a participant runs can create the event account:

`wrangler r2 bucket create my-bucket --temporary --event-code <code>`

R2 and Containers are only available on event accounts. R2 custom domains, Sippy, external container registries and `wrangler cloudchamber` commands still require a logged-in account.
