---
"create-cloudflare": patch
---

Handle git commit failures gracefully

When creating the initial commit fails (for example, when GPG signing is cancelled or misconfigured), the setup process now continues instead of crashing. A message is displayed informing the user that the commit was skipped and they can commit manually later.
