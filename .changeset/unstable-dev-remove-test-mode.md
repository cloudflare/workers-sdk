---
"wrangler": minor
---

Remove the deprecated `experimental.testMode` option from `unstable_dev`

`experimental.testMode` previously only affected the default `logLevel` (`warn` when `testMode: true`, `log` otherwise) and has been flagged for removal in its type-definition comment since it landed. It is now removed, and `unstable_dev`'s default log level matches `wrangler dev`'s (`log`).

Callers that explicitly passed `testMode: true` to get quieter logs should now set `logLevel: "warn"` directly.
