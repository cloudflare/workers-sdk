---
"wrangler": patch
---

feat: path to a custom `tsconfig`

This adds a config field and a command line arg `tsconfig` for passing a path to a custom typescript configuration file. We don't do any typechecking, but we do pass it along to our build process so things like `compilerOptions.paths` get resolved correctly.
