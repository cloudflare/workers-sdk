---
"wrangler": minor
---

Categorise the positional path argument to `wrangler deploy` and `wrangler versions upload` in command telemetry

Command telemetry now records a coarse category for the entry-point/assets positional (`wrangler deploy <path>`) under `sanitizedArgs.path`, so we can understand whether people pass a file, a directory, or a relational reference such as `.` or `../example`. The possible values are `file`, `directory`, `current-dir`, `parent-relative`, and `not-found`, or `null` when no positional is provided. The raw path is never sent — only the category.
