---
"wrangler": minor
---

Statically replace the value of `process.env.NODE_ENV` with `development` for development builds and `production` for production builds if it is not set. Else, use the given value. This ensures that libraries, such as React, that branch code based on `process.env.NODE_ENV` can be properly tree shaken.
