---
"wrangler": patch
---

fix: do not exit `wrangler dev` when forwarding a single request to the Worker fails

The dev proxy forwards every incoming request to the user Worker with `fetch()`. When that `fetch()` rejected — most commonly because the client disconnected while its request body was still being uploaded ("Network connection lost." / "Can't read from request stream because client disconnected"), or because a request the proxy had queued during startup or a reload was abandoned before it could be replayed — the rejection was reported as a fatal ProxyWorker error and the whole `wrangler dev` session exited. A rejected forward is the outcome of that one request, not a defect in the proxy, so it is now answered with a `502` and logged at debug level, and the dev session keeps running. Errors thrown while post-processing a response are still reported as before.
