---
"wrangler": patch
---

fix: do not publish to workers.dev if workers_dev is false

Previously we always published to the workers.dev subdomain, ignoring the `workers_dev` setting in the `wrangler.toml` configuration.

Now we respect this configuration setting, and also disable an current workers.dev subdomain worker when we publish and `workers_dev` is `false`.

Fixes #410
