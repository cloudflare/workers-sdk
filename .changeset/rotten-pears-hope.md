---
"wrangler": patch
---

fix: avoid esbuild warning when running dev/bundle

I've been experimenting with esbuild 0.21.4 with wrangler. It's mostly been fine. But I get this warning every time

```
▲ [WARNING] Import "__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__" will always be undefined because there is no matching export in "src/index.ts" [import-is-undefined]

    .wrangler/tmp/bundle-Z3YXTd/middleware-insertion-facade.js:8:23:
      8 │ .....(OTHER_EXPORTS.__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ ?? []),
        ╵
```

This is because esbuild@0.18.5 enabled a warning by default whenever an undefined import is accessed on an imports object. However we abuse imports to inject stuff in `middleware.test.ts`. A simple fix is to only inject that code in tests.
