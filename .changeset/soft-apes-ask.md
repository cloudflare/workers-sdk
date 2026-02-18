---
"wrangler": patch
---

Implemented logic within `wrangler containers registries configure` to check if a specified secret name is already in-use and offer to reuse that secret. Also added `--skip-confirmation` flag to the command to skip all interactive prompts.
