---
"wrangler": patch
---

fix: module support in service-worker format workers

This rewrites how we pass configuration to miniflare in `wrangler dev`'s local mode. Instead of passing the entire configuration as cli args, we now generate a `wrangler.toml` based on our generated/inferred configuration, and pass that to miniflare instead. This solves a couple of issues, notably -

- `text_blobs` now works in local mode+service-worker format
- `Text` modules now work in local mode+service-worker format
- We properly throw errors for `Data` module in service-worker format

Along with https://github.com/cloudflare/miniflare/pull/205, this fixes https://github.com/cloudflare/wrangler2/issues/416.
