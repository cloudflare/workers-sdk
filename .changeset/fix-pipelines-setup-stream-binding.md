---
"wrangler": patch
---

use `stream` instead of deprecated `pipeline` key in pipelines setup config snippet

The `wrangler pipelines setup` and `wrangler pipelines create` commands now output the correct `stream` property name in the configuration snippet, matching the rename from `pipeline` to `stream` that was applied across the rest of the codebase.
