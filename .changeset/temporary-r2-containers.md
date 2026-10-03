---
"wrangler": minor
---

Support temporary event accounts in R2 and Containers commands

`wrangler r2` and `wrangler containers` commands now accept `--temporary`, so accounts created for an event can manage buckets, objects and containers directly. Every command that supports `--temporary` now also accepts `--event-code`, so the first command a participant runs can create the event account:

`wrangler r2 bucket create my-bucket --temporary --event-code <code>`

R2 and Containers are only available on event accounts. When an R2 request from a temporary account is denied, Wrangler now suggests creating an event account. R2 custom domains, Sippy, external container registries and `wrangler cloudchamber` commands still require a logged-in account.
