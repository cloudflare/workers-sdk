---
"wrangler": patch
---

Improve error message when modules cannot be resolved during bundling

When a module cannot be resolved during bundling, Wrangler now suggests using the `alias` configuration option to substitute it with an alternative implementation. This replaces esbuild's default suggestion to "mark the path as external", which is not a supported option in Wrangler.

For example, if you try to import a module that doesn't exist:

```js
import foo from "some-missing-module";
```

Wrangler will now suggest:

```
To fix this, you can add an entry to "alias" in your Wrangler configuration
to substitute "some-missing-module" with an alternative implementation.
See https://developers.cloudflare.com/workers/wrangler/configuration/#bundling-issues
```

This provides actionable guidance for resolving import errors.
