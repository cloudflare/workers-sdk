---
"wrangler": patch
---

`wrangler dev` no longer exits when a request to your Worker fails transiently

Previously, a transient network failure on a single request — most commonly a request arriving just as an idle internal connection was closed, after roughly five seconds without traffic — could take down the whole dev server with an empty `✘ [ERROR]`, leaving the port unbound until restarted. In CI test suites, one such failure caused every remaining test to fail with connection errors.

`wrangler dev` now automatically retries the affected request if it is safe to repeat (GET and HEAD requests). If a request still fails, it fails individually — the error is logged with the request method and URL — and the dev server keeps serving.
