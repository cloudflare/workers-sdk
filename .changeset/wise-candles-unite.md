---
"wrangler": patch
---

feat: `publish --outdir <path>`

It can be useful to introspect built assets. A leading usecase is to upload the sourcemap that we generate to services like sentry etc, so that errors from the worker can be mapped against actual source code. We introduce a `--outdir` cli arg to specify a path to generate built assets at, which doesn't get cleaned up after publishing. We are _not_ adding this to `wrangler.toml` just yet, but could in the future if it looks appropriate there.
