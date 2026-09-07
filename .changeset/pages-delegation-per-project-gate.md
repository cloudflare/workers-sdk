---
"wrangler": minor
---

Widen agent Pages-to-Workers delegation to new projects on accounts that already use Pages

When run by an AI agent, `wrangler pages deploy` and `wrangler pages project create` now delegate a brand-new static Pages project to a Workers static-assets deploy even when the account already has other Pages projects. The gate is now per-project rather than per-account: a command targeting a project that already exists stays on Pages, but a new project is delegated regardless of the account's other Pages projects.

A project name restored from the Pages configuration cache is only used when the cache belongs to the currently authenticated account. After switching accounts, an otherwise unnamed deploy stays on Pages rather than treating a stale cached project name as a new project on the selected account.
