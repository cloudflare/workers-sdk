---
"@cloudflare/pages-functions": minor
---

Add @cloudflare/pages-functions package

Extracts the Pages functions-to-worker compilation logic from wrangler into a standalone package.

This enables converting a Pages functions directory into a deployable worker entrypoint, which is needed for the Autoconfig Pages work where `wrangler deploy` should "just work" for Pages projects.

```ts
import { compileFunctions } from "@cloudflare/pages-functions";

const result = await compileFunctions("./functions");
// result.code - generated worker entrypoint
// result.routesJson - _routes.json for Pages deployment
```
