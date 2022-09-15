---
"wrangler": patch
---

feat: testing scheduled events with `wrangler dev` remote mode

Using the new middleware (https://github.com/cloudflare/wrangler2/pull/1735), we implement a way of testing scheduled workers from a fetch using `wrangler dev` in remote mode, by passing a new command line flag `--test-scheduled`. This exposes a route `/__scheduled` which will trigger the scheduled event.

```sh
$ npx wrangler dev index.js --test-scheduled

$ curl http://localhost:8787/__scheduled
```

Closes https://github.com/cloudflare/wrangler2/issues/570
