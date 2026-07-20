---
"wrangler": minor
"@cloudflare/deploy-helpers": minor
---

Apply Email Routing `addresses` during Worker trigger deployment

Worker trigger deployment now reconciles the Worker's Email Routing rules with the top-level `addresses` config. This runs for `wrangler deploy`, `wrangler triggers deploy`, and clients of `@cloudflare/deploy-helpers`. After the Worker uploads, or when `wrangler triggers deploy` runs after a version promotion, the deploy helper asks the Email Routing API for a plan, renders the changes grouped by zone (`+` added, `~` updated, `-` deleted, `!` conflict), prompts once for destructive changes in interactive mode, and applies accepted changes through the per-zone rule endpoints. Purely additive plans apply without a prompt, while non-interactive destructive plans fail without modifying rules.
