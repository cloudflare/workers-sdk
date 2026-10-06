---
"@cloudflare/deploy-helpers": minor
---

Add a result-only output mode to Preview deployment helpers

Pass `log: false` to `previewBuildOutput()` to return the Preview, deployment, and creation status without printing progress or a deployment summary. Asset and container progress is suppressed, while warnings remain visible and failures still reject the promise. Existing human-readable and JSON output remain the default.
