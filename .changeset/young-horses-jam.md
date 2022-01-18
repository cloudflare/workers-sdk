---
"wrangler": patch
---

chore: add test-watch script to the wrangler workspace

Watch the files in the wrangler workspace, and run the tests when anything changes:

```sh
> npm run test-watch -w wrangler
```

This will also run all the tests in a single process (rather than in parallel shards) and will increase the test-timeout to 50 seconds, which is helpful when debugging.
