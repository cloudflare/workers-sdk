---
"@cloudflare/workflows-shared": patch
---

Fix local Workflows retaining abort listeners after waits complete

Workflow sleeps, retry delays, dynamic delay timeouts, and event waits now remove their abort listeners when either side of the wait settles. This prevents long-running local Workflow instances from retaining a listener and its captured promise state for every completed wait until the instance is paused or evicted.
