---
"wrangler": minor
---

Widen Pages-to-Workers delegation to any new project, and add a categorical opt-out rationale

`wrangler pages deploy` and `wrangler pages project create`, when run by an AI agent, now delegate to a Workers static-assets deploy for any new Pages project, rather than only for accounts that have never created a Pages project. The gate is now per-project: an account with existing Pages projects is still delegated when the targeted project is new, but a deploy to an existing project is left on Pages.

The opt-out flag is renamed to `--i-really-want-to-deploy-to-pages-because-i-have-a-rationale`, and a companion `--agent-rationale-context` records why an agent bypassed delegation. Only a fixed set of categories is recorded (e.g. `user-requested-pages`, `workers-delegation-failed`); the raw value is never transmitted, so the field cannot carry secrets or personal data. Anything outside the known set is recorded as `other`, and a missing rationale as `unspecified`. The category menu is included in the agent-facing guidance and delegation-failure messages, which are the only place an agent discovers the opt-out flag.
