---
"wrangler": patch
---

Fixes `wrangler pages publish` not uploading static file imports from Functions.

Previously, when a user ran `wrangler pages publish public/` and also had a Function which imported static assets:

```tsx
import filePath from "assets:../static/foo.txt";
```

The contents of the imported files would never make it to the deployment. This change updates the `buildOutputDirectory` option passed into `buildFunctions` from the `publish` API such that the `buildOutputDirectory` becomes whatever was passed into `wrangler pages publish <dir>`
