---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Switch out the internals of the multiworker dev registry to be powered by [Cap'n Web](https://github.com/cloudflare/capnweb) and [Remote Bindings](https://developers.cloudflare.com/changelog/2025-09-16-remote-bindings-ga/). This is a backwards-incompatible change, and so after upgrading it won't be possible to connect to running dev sessions using an older version of Miniflare. This brings stability benefits as well as support for JSRPC when binding directly to an external Durabl Object.
