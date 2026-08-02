---
"wrangler": minor
---

Fix delegated `wrangler pages deploy` directory handling, delegate just-created empty projects, and require a recognised opt-out rationale

When an AI agent's `wrangler pages deploy <dir>` is delegated to a Workers static-assets deploy, Wrangler now configures exactly the directory you named. Previously the delegated deploy re-guessed the assets directory and could fail with "Missing entry-point to Worker script or to assets directory"; the named directory is now handed to autoconfig as an explicit output-directory hint, so it deterministically writes a Workers config with a compatibility date and publishes that directory.

A Pages project that already exists but has no deployment and was created within the last hour is now treated as a fresh artefact of the current agent run and delegated to Workers, just like a brand-new project. This closes a gap where an agent that force-created an empty project and then ran `pages deploy` without the opt-out flag would silently land on Pages. Established projects (one or more deployments) and older empty projects are unaffected and continue to deploy to Pages.

The opt-out flag `--i-really-want-to-deploy-to-pages-because-i-have-a-rationale` now requires `--agent-rationale-context` to be one of the recognised categories (for example `user-requested-pages` or `workers-delegation-failed`). A missing or unrecognised value is rejected with an error that lists the available categories, and the raw value is never echoed or transmitted, so the field cannot carry secrets or personal data. This applies to both `wrangler pages deploy` and `wrangler pages project create`.
