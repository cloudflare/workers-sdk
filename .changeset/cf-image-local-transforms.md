---
"miniflare": minor
---

Support `cf.image` (transform via Workers) image transformations in local dev

`fetch(url, { cf: { image: { ... } } })` now transforms images locally via Sharp, instead of returning the original bytes unchanged. This mirrors the production "transform via Workers" feature, so Workers already using `cf.image` behave much more closely to production in `wrangler dev`.

Outbound requests are now routed through a single outbound interceptor Worker that applies the existing `stripCfConnectingIp` header rewrite and the new, always-on `cf.image` transform. As with the Images binding's local mode this is low fidelity — only resize, rotate and format conversion are honoured and unsupported options are ignored — but it follows production `cf.image` semantics (the `fit` modes, the `format: "json"` output shape, the `Via: image-resizing` loop-prevention header). When a transform cannot be performed the original image is returned unchanged, matching the edge's fail-open behaviour.
