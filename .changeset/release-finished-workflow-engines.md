---
"miniflare": patch
"@cloudflare/workflows-shared": patch
---

Fix local Workflows running out of file handles after many instances finish

Finished local Workflow instances now release their engine once it is idle, instead of keeping its storage files open until workerd fails with "Too many open files". Their status and output stay available. Sleeps, retries and timeouts are now kept in a Durable Object alarm, so an instance whose engine is evicted or aborted, for example by `abortAllDurableObjects()` in a test, carries on when its alarm fires.
