---
"create-cloudflare": minor
"wrangler": minor
---

Add hidden CLI flags to `wrangler setup` for suppressing output

Two new hidden flags have been added to `wrangler setup`:

- `--no-completion-message`: Suppresses the deployment details message after setup completes
- `--no-install-wrangler`: Skips Wrangler installation during project setup

These flags allow `create-cloudflare` to call `wrangler setup` without redundant output.
