---
"wrangler": patch
---

fix: add warning about setting upstream-protocol to `http`

We have not implemented setting upstream-protocol to `http` and currently do not intend to.

This change just adds a warning if a developer tries to do so and provides a link to an issue where they can add their use-case.
