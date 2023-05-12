---
"wrangler": major
---

feature: rename `wrangler publish` to `wrangler deploy`

This ensures consistency with other messaging, documentation and our dashboard,
which all refer to deployments. This also avoids confusion with the similar but
very different `npm publish` command. `wrangler publish` will remain a
deprecated alias for now, but will be removed in the next major version of Wrangler.
