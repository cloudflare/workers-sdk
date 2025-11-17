---
"wrangler": minor
---

Implement the `wrangler r2 bulk put bucket-name --filename list.json` command.

The command uploads multiple objects to an R2 bucket.

The list of object is provided as a JSON encoded file via `--filename`. It is a list of key and file (respectively the name and the content for the object).

```
[
  { "key": "/path/to/obj", "file": "/path/to/file_1"},
  { "key": "/path/to/other/obj", "file": "/path/to/file_2"},
  // ...
]
```

Uploads are executed concurrently and the level of concurrency can be set via `--concurrency`.

The command supports the same options as `wrangler r2 object put`, minus `--file`, and `--pipe` and plus `--concurrency`
