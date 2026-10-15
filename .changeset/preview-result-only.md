---
"@cloudflare/deploy-helpers": minor
---

Add a result-only output mode to Preview deployment helpers

Pass `log: false` to `previewBuildOutput()` to return the Preview, deployment, creation status, and resolved pull request URL/number without printing progress or a deployment summary. Asset and container progress is suppressed, while warnings remain visible and deployment failures still reject the promise. A failed warning-only configuration lookup no longer rejects an already successful deployment. Existing human-readable and JSON output remain the default.
