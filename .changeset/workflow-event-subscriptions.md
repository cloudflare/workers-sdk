---
"@cloudflare/workflows-shared": minor
"miniflare": minor
---

Add experimental Workflow event subscriptions to local development

Local Workflow instances now implement `subscribe()`, returning a disposable RPC subscription that streams historical and live lifecycle events. Subscriptions support event cursors and type filters and include Workflow inputs, step configuration, outputs, failures, retries, waits, and rollback activity where applicable.
