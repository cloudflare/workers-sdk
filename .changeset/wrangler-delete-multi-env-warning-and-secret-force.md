---
"wrangler": minor
---

- Warn when running `wrangler delete` without `--env` if multiple environments are defined in the Wrangler configuration (matching `wrangler deploy` and `wrangler secret delete`).
- Add an optional `--force` flag to `wrangler secret delete` to explicitly skip the confirmation prompt in non-interactive environments.
