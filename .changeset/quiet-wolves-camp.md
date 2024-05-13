---
"wrangler": minor
---

fix: Display correct global flags in `wrangler pages --help`

Running `wrangler pages --help` will list, amongst others, the following global flags:

```
-j, --experimental-json-config
-c, --config
-e, --env
-h, --help
-v, --version
```

This is not accurate, since flags such as `--config`, `--experimental-json-config`, or `env` are not supported by Pages.

This commit ensures we display the correct global flags that apply to Pages.
