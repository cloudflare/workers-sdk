---
"wrangler": patch
---

Fix autoconfig using absolute paths for static projects

Running the experimental autoconfig logic through `wrangler setup` and `wrangler deploy --x-autoconfig` on a static project results in absolute paths being used, this is incorrect, especially when such paths are being included in the generated wrangler.jsonc, the changes here fix the autoconfig logic to instead use paths relative to the project's root instead.

For example given a project located in `/Users/usr/projects/sites/my-static-site`, before:

```ts
// wrangler.jsonc at /Users/usr/projects/sites/my-static-site
  {
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "static",
    "compatibility_date": "2025-11-27",
    "observability": {
      "enabled": true
    },
    "assets": {
      "directory": "/Users/usr/projects/sites/my-static-site/public"
    }
  }
```

and after:

```ts
// wrangler.jsonc at /Users/usr/projects/sites/my-static-site
  {
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "static",
    "compatibility_date": "2025-11-27",
    "observability": {
      "enabled": true
    },
    "assets": {
      "directory": "public"
    }
  }
```
