---
"wrangler": patch
---

Prevent Workers Assets uploads from hanging indefinitely

Asset upload requests now time out after two minutes and enter Wrangler's existing retry flow. If all retries time out, Wrangler reports a resumable upload error instead of waiting for the surrounding build to terminate the deployment.
