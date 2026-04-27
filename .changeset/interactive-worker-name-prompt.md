---
"wrangler": minor
---

Prompt for Worker name interactively when not provided during `wrangler deploy`

When deploying without a `name` in your Wrangler config or `--name` CLI argument, `wrangler deploy` now interactively prompts you to choose a Worker name instead of failing. The default suggestion is derived from the entry-point filename (e.g. `my-api.ts` → `my-api`), falling back to the current directory name when the entry-point has a generic name like `index.js` or `worker.ts`. Input is validated against Cloudflare's Worker naming rules (lowercase alphanumeric and dashes, max 63 characters). In non-interactive or CI environments, the existing error message is still shown.
