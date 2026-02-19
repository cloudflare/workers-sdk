---
"wrangler": patch
---

fix: pass `--env` flag to auxiliary workers in multi-worker mode

When running `wrangler dev` with multiple config files (e.g. `-c ./apps/api/wrangler.jsonc -c ./apps/queues/wrangler.jsonc -e=dev`), the `--env` flag was not being passed to auxiliary (non-primary) workers. This meant that environment-specific configuration (such as queue bindings) was not applied to auxiliary workers, causing features like queue consumers to not be triggered in local development.
