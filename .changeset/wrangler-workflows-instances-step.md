---
"wrangler": minor
---

Add `wrangler workflows instances step` to fetch a single step's full output

`wrangler workflows instances describe` shows step outputs truncated to 1024 characters (server-side); the new `step` subcommand retrieves the complete, untruncated output for one step by name and type. It works against both the remote API and a local dev session (`--local`) and prints JSON or up to 2 MiB of streamed text to stdout. With `--output <file>` it streams the output straight to disk, so binary and very large (up to ~1 GiB) streamed outputs are saved without buffering in memory. Omitting `--attempt` returns the step's final outcome; passing `--attempt` scopes to a specific attempt's error.
