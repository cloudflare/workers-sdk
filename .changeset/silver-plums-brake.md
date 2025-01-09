---
"wrangler": minor
---

Add support for env files to wrangler secret bulk i.e. `.dev.vars`

Run `wrangler secret bulk .dev.vars` to add the env file

```env
//.dev.vars
KEY=VALUE
KEY_2=VALUE
```

This will upload the secrets KEY and KEY_2 to your worker
