---
"miniflare": minor
---

Remove the top-level Worker discriminator from Miniflare options

Worker configs passed to Miniflare no longer require or accept `type: "worker"`. Nested Worker binding and export discriminators are unchanged.
