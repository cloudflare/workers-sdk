---
"wrangler": patch
---

Treat the "name" parameter in `wrangler init` as a path.

This means that running `wrangler init .` will create a worker in the current directory,
and the worker's name will be the name of the current directory.

You can also run `wrangler init path/to/my-worker` and a worker will be created at
`[CWD]/path/to/my-worker` with the name `my-worker`,
