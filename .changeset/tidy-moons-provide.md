---
"wrangler": patch
---

`wrangler dev` no longer exits when a proxied request to the UserWorker fails transiently

When a request proxied to the UserWorker failed while the UserWorker's origin was unchanged — most commonly a reused keep-alive connection that the UserWorker's HTTP server closed at the same moment the request was written to it — the ProxyWorker reported a fatal error and the whole dev server exited with an empty `✘ [ERROR]`, leaving the port unbound. In CI test suites one such transient failure killed every remaining test.

The ProxyWorker now retries bodyless (GET/HEAD) requests before reporting, which absorbs the transient failure on a fresh connection, and an exhausted or non-retriable failure is logged — including the request method, URL and underlying exception — while the dev server keeps serving. Only the affected request fails.
