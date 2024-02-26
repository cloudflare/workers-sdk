---
"wrangler": patch
---

feat: expose `--show-interactive-dev-session` flag

This flag disables the interactive mode of the dev session, a feature that already exists internally but was not exposed to the user.
This is useful for CI/CD environments where the interactive mode is not desired, or running in tools like `turbo` and `nx`.
