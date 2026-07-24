---
"@cloudflare/pages-functions": minor
---

Publish helpers for compiling Pages Functions directories into Workers bundle

Provides both a programmatic API and a CLI (`pages-functions build`) for converting a Cloudflare Pages `functions/` directory into a Cloudflare Workers bundle:

```sh
npx @cloudflare/pages-functions build ./functions --outdir ./dist
```

The package compiles the Worker and its auxiliary modules, but does not deploy them or generate deployment configuration. Consumers must provide the appropriate Wrangler configuration, including the selected fallback service binding (`ASSETS` by default) when applicable.
