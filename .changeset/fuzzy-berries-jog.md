---
"create-cloudflare": patch
---

refactor: Refactor C3 internal helpers. Includes a few small changes:

- Drops `--save` from internal `pnpm` and `npm` install invocations
- Switches to `git branch --show-current` for detecting current branch
