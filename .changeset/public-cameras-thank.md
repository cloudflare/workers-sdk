---
"miniflare": patch
"wrangler": patch
---

fix: strip `CF-Connecting-IP` header within `fetch`

In v4.15.0, Miniflare began stripping the `CF-Connecting-IP` header via a global outbound service, which led to a TCP connection regression due to a bug in Workerd. This PR patches the `fetch` API to strip the header during local `wrangler dev` sessions as a temporary workaround until the underlying issue is resolved.
