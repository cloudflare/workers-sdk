---
"wrangler": patch
---

feat: implement time travel for experimental d1 dbs

This PR adds two commands under `wrangler d1 time-travel`:

```
Interact with D1 Time Travel

Commands:

wrangler d1 time-travel info <database> Get information about D1 at a point in time.
Options:
      --timestamp  timestamp (accepts unix timestamp or ISO strings) to use for time travel  [string]
      --json       return output as clean JSON  [boolean] [default: false]

wrangler d1 time-travel restore <database> Restore a D1 database to a point in time.
Options:
      --bookmark   Bookmark to use for time travel  [string]
      --timestamp  Timestamp to use for time travel  [string]
      --json       return output as clean JSON  [boolean] [default: false]
```

Closes #3577
