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

This is because esbuild@0.18.5 enabled a warning by default whenever an undefined import is accessed on an imports object. However we abuse imports to inject stuff in `middleware.test.ts`. We should probably fix that with a better solution, but an immediate fix to this warning is to make that access not be statically analyzable. This patch does so by defining the export name as a regular variable and using that when reading from it.
