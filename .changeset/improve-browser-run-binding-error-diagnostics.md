---
"miniflare": patch
---

Improve error diagnostics in the Browser Run binding worker

When the local Browser Run binding failed to reach an upstream — for example when Chrome failed to launch and miniflare's loopback `/browser/launch` endpoint returned a 500 with a stack-trace text body — the binding worker would call `response.json()` on the non-JSON body and throw an opaque `SyntaxError: Unexpected token X, "..." is not valid JSON`. The actual upstream error message (e.g. `Chrome readiness probe at ... timed out after 5000ms`) was discarded.

The binding worker now reads the response body as text first, surfaces the HTTP status and body content in the thrown error, and chains the original `SyntaxError` via `cause` when the body was a 2xx response that didn't parse as JSON. This makes both local-dev failures and CI test flakes self-diagnosing.
