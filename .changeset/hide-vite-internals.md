---
"miniflare": patch
"wrangler": patch
---

Keep Vite's internal requests out of the Observability views

Under the Vite plugin, Vite makes its own requests to drive the module runner. Those were listed as traces alongside your app's, and their RPC dispatch showed up as logs — in one session that was 8 of 11 rows in the Traces list. They aren't requests you made and don't exist in a deployed Worker, so they're now left out of both lists.

Failures are never hidden, and a plain `wrangler dev` session is unaffected.
