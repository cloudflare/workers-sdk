---
"wrangler": patch
---

feat: implement time travel for experimental d1 dbs

This PR adds two commands under `wrangler d1 time-travel`:

```
Use Time Travel to restore, fork or copy a database at a specific point-in-time.

Commands:

wrangler d1 time-travel info <database>     Retrieve information about a database at a specific point-in-time using Time Travel.
Options:
      --timestamp  accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for  [string]
      --json       return output as clean JSON  [boolean] [default: false]

wrangler d1 time-travel restore <database>  Restore a database back to a specific point-in-time.
Options:
      --bookmark   Bookmark to use for time travel  [string]
      --timestamp  accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for  [string]
      --json       return output as clean JSON  [boolean] [default: false]
```

Closes #3577
