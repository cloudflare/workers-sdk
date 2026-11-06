---
"wrangler": patch
---

Preserve environment inputs when automatically regenerating Worker types

Automatic type regeneration now reuses the recorded `--env` and `--env-file` options. This keeps environment-specific bindings and secret declarations consistent with the generated header and subsequent `wrangler types --check` runs.
