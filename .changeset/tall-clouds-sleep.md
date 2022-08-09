---
"wrangler": patch
---

Deprecated --experimental-enable-local-persistence.

Added --persist and --persist-to in its place. Changed the default persistence directory to .wrangler/state, relative to wrangler.toml.

To migrate to the new flag, run `mkdir -p .wrangler && mv wrangler-local-state .wrangler/state` then use `--persist`. Alternatively, you can use `--persist-to=./wrangler-local-state` to keep using the files in the old location.
