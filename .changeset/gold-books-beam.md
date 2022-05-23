---
"wrangler": patch
---

refactor: detect missing `[migrations]` during config validation

This does a small refactor -

- During publish, we were checking whether `[migrations]` were defined in the presence of `[durable_objects]`, and warning if not. This moves it into the config validation step, which means it'll check for all commands (but notably `dev`)
- It moves the code to determine current migration tag/migrations to upload into a helper. We'll be reusing this soon when we upload migrations to `dev`.
