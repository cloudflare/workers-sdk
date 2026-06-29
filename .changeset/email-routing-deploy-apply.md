---
"wrangler": minor
---

Apply Email Routing `addresses` during `wrangler deploy`

`wrangler deploy` now reconciles the Worker's Email Routing rules with the top-level `addresses` config. After the Worker uploads, Wrangler asks the Email Routing API for a plan, renders the changes grouped by zone (`+` added, `~` updated, `-` deleted, `!` conflict), prompts once for any destructive changes (deletes or takeover conflicts) in interactive mode — and hard-fails in non-interactive/CI mode — then applies the accepted changes through the per-zone rule endpoints, tagging them as owned by the deploying Worker. Purely additive plans apply without a prompt, and `wrangler deploy --dry-run` still only validates and prints the desired set without any network calls.
