---
"wrangler": patch
---

feat: top level `main` config field

This implements a top level `main` field for `wrangler.toml` to define an entry point for the worker , and adds a deprecation warning for `build.upload.main`. The deprecation warning is detailed enough to give the exact line to copy-paste into your config file. Example -

```
The `build.upload` field is deprecated. Delete the `build.upload` field, and add this to your configuration file:

main = "src/chat.mjs"
```

This also makes `./dist` a default for `build.upload.dir`, to match wrangler 1's behaviour.

Closes https://github.com/cloudflare/wrangler2/issues/488
