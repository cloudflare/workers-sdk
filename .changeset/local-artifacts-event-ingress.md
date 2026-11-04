---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": patch
---

Deliver local Artifacts events to Workflows and queues

Local Artifacts namespaces now publish the documented `cf.artifacts.*` event messages for repository create, import, fork, and delete operations and for token creation and revocation. `wrangler dev` and Workers Vitest start a Worker's Workflows from the Artifacts `triggers.events` configuration, and the Miniflare option `artifactsEventSubscriptions` delivers events to a local queue, like a Queues event subscription. Successful create, import, and fork operations also publish the initial token-created event. Delivery follows the committed mutation, is unordered, and does not fail the repository operation if a destination rejects it. Push, clone, and fetch events are not yet published locally.
