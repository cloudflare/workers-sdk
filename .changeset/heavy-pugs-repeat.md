---
"miniflare": patch
"wrangler": patch
---

Report the Worker's error for `HEAD` requests instead of an internal JSON parse error

A Worker that threw on a `HEAD` request (for example `curl -I`) logged `SyntaxError: Unexpected end of JSON input` from miniflare's internals rather than the actual error, and `dispatchFetch()` rejected with that same misleading error. `workerd` drops response bodies for `HEAD` requests, so the serialised error never reached the code that revives it.

The error is now also carried in a header, which survives `HEAD`, so the original message and source-mapped stack are reported for every method. When no payload is available the reporting degrades to a plain error rather than surfacing a parse failure.
