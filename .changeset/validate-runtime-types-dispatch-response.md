---
"@cloudflare/runtime-types": patch
---

Reject non-declaration responses from the runtime type generation endpoint

`generateRuntimeTypes()` now validates the response from the type generation dispatch endpoint before returning it. Responses that are HTML documents (detected via the content-type header or document markers) throw an error naming the dispatch URL instead of being written verbatim into the generated `.d.ts` file.

Previously, only the HTTP status was checked, so an HTML page returned with HTTP 200 — for example from a parked domain — would silently end up in `worker-configuration.d.ts`.
