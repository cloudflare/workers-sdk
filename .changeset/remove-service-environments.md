---
"wrangler": minor
---

Remove support for service environments and the `legacy_env` configuration field

Service environments have been removed. Wrangler now always deploys each environment as its own Worker named `<name>-<environment>`, which matches the behaviour of the previous default (`legacy_env = true`). The `--legacy-env` CLI flag has been removed, and the `legacy_env` configuration field is no longer supported — including it in your configuration file will now raise an error.

Because `legacy_env = true` was already the default, removing the field will not change how your Worker is deployed. If you were relying on service environments (`legacy_env = false`), each environment will now be deployed as a standalone Worker instead of as an environment of a single Worker. See https://developers.cloudflare.com/workers/wrangler/environments/ for more information.
