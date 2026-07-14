---
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Add experimental config support for declarative Workflow exports and cross-Worker Workflow bindings

`cloudflare.config.ts` can now declare owned Workflows with `exports.workflow()`, including step limits and schedules, and create typed external bindings with a referenced Worker's `workflow()` helper. Wrangler deploys and locally simulates these exports, while the Vite plugin recognizes them as `WorkflowEntrypoint` exports.
