---
"wrangler": minor
---

Add `getSupportedCompatibilityDate` export

Adds a new `getSupportedCompatibilityDate()` function that returns the latest compatibility date supported by the local workerd runtime.

```ts
import { getSupportedCompatibilityDate } from "wrangler";

const compatDate = getSupportedCompatibilityDate(); // e.g. "2026-01-31"
```
