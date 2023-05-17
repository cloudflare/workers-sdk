---
"wrangler": major
---

feature: enable local development with Miniflare 3 and `workerd` by default

`wrangler dev` now runs fully-locally by default, using the open-source Cloudflare Workers runtime [`workerd`](https://github.com/cloudflare/workerd).
To restore the previous behaviour of running on a remote machine with access to production data, use the new `--remote` flag.
The `--local` and `--experimental-local` flags have been deprecated, as this behaviour is now the default, and will be removed in the next major version.
