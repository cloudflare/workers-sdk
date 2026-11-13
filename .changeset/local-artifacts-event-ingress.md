---
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": patch
---

Start local Workflows from Artifacts events

Declare Artifacts events on `exports.workflow({ name, events })` in `cloudflare.config.ts` to start the owning Workflow locally in `cf`, Vite, and Workers Vitest. Wrangler configurations continue to use `triggers.events`. Native config conversion derives those targets from the Workflow export, and `cf migrate` attaches existing event subscriptions to their matching Workflow exports.

Local Artifacts namespaces publish the documented `cf.artifacts.*` messages for repository create, import, fork, and delete operations and token creation and revocation. Successful create, import, and fork operations also publish the initial token-created event. Delivery follows the committed mutation, is unordered, and does not fail the repository operation if a destination rejects it. Push, clone, and fetch events are not yet published locally. This feature does not provide local Artifacts-to-queue subscriptions.
