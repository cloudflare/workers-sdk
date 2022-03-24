---
"wrangler": patch
---

fix: add warning about `wrangler dev` with remote Durable Objects

Durable Objects that are being bound by `script_name` will not be isolated from the
live data during development with `wrangler dev`.
This change simply warns the developer about this, so that they can back out before
accidentally changing live data.

Fixes #319
