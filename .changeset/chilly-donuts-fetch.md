---
"wrangler": minor
---

Prefer the `workerd` `exports` condition when bundling.

This can be used to build isomorphic libraries that have different implementations depending on the JavaScript runtime they're running in.
When bundling, Wrangler will try to load the [`workerd` key](https://runtime-keys.proposal.wintercg.org/#workerd).
This is the [standard key](https://runtime-keys.proposal.wintercg.org/#workerd) for the Cloudflare Workers runtime.
Learn more about the [conditional `exports` field here](https://nodejs.org/api/packages.html#conditional-exports).
