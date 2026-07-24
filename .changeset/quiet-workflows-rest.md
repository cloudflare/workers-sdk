---
"@cloudflare/workflows-shared": patch
---

Fix local Workflows retaining abort listeners after waits complete

Workflow sleeps, retry delays, and event waits now share a typed abort-aware race that removes its listener when either side settles. This prevents long-running local Workflow instances from retaining a listener and its captured promise state for every completed wait until the instance is paused or evicted.
