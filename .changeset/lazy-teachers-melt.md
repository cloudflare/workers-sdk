---
"wrangler": patch
---

If `--env <env>` is specified, we'll now check `.env.<env>`/`.dev.vars.<env>` first.
If they don't exist, we'll fallback to `.env`/`.dev.vars`.
