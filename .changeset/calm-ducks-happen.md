---
"wrangler": minor
---

feat: add experimental support for hybrid Node.js compatibility

_This feature is experimental and not yet available for general consumption._

Use a combination of workerd Node.js builtins (behind the `experimental:nodejs_compat_v2` flag) and
Unenv polyfills (configured to only add those missing from the runtime) to provide a new more effective
Node.js compatibility approach.
