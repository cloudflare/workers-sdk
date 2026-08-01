---
"wrangler": minor
---

Delegate agent Pages deploys that target a production branch to Workers

When run by an AI agent, `wrangler pages deploy --branch <name>` and `wrangler pages project create --production-branch <name>` are now eligible for delegation to a Workers static-assets deploy. Previously any `--branch` or `--production-branch` flag disqualified the command, which meant the most common agent invocation — deploying the main branch of a brand-new static project — fell through to a direct Pages deploy instead of being delegated.

Delegation only ever fires for a brand-new project, and on a new project a branch flag simply names the production branch, which is exactly what a Workers deploy targets, so there are no preview-deployment semantics to preserve. Genuinely Pages-only flags (`--commit-hash`, `--commit-message`, `--commit-dirty`, `--skip-caching`) still disqualify a deploy from delegation.
