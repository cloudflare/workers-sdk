---
"wrangler": patch
---

Clean up stale queue consumer registrations during `wrangler deploy`

Previously, `wrangler deploy` only ever created or updated the queue consumers listed in `queues.consumers`. If a user removed a consumer from their config and redeployed, the stale consumer registration was left behind and the worker would keep receiving messages from a queue it no longer declared.

Wrangler now sends the full, authoritative list of declared consumers to a single script-level endpoint on every deploy. Consumers that have been removed from the config are deleted, and the per-consumer outcome (created / updated / removed / failed) is reported inline with the rest of the trigger summary:

```
Deployed my-worker triggers (TIMINGS)
  https://my-worker.workers.dev
  Consumer for order-queue
  Removed consumer for old-queue
```

If a consumer fails to configure, the error is printed both inline and to stderr, and the deploy exits with a non-zero status without aborting other trigger deployments.
