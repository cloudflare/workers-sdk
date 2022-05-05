---
"wrangler": patch
---

feat: Adds 'assets:' loader for Pages Functions.

This lets users and Plugin authors include a folder of static assets in Pages Functions.

```ts
export { onRequest } from "assets:../folder/of/static/assets";
```

More information in [our docs](https://developers.cloudflare.com/pages/platform/functions/plugins/).
