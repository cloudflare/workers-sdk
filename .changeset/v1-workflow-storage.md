---
"@cloudflare/vite-plugin": patch
---

Update the local Workflow runtime to use native storage cleanup

Consume the Miniflare fix that queues Workflow persistence deletion with instance recreation, including deletion through the local Explorer. This prevents storage cleanup from racing reuse of the same Workflow instance ID.
