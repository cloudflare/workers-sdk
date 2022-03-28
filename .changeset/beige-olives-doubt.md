---
"wrangler": patch
---

fix: ensure the correct worker name is published in legacy environments

When a developer uses `--env` to specify an environment name, the Worker name should
be computed from the top-level Worker name and the environment name.

When the given environment name does not match those in the wrangler.toml, we error.
But if no environments have been specified in the wrangler.toml, at all, then we only
log a warning and continue.

In this second case, we were reusing the top-level environment, which did not have the
correct legacy environment fields set, such as the name. Now we ensure that such an
environment is created as needed.

See https://github.com/cloudflare/wrangler2/pull/680#issuecomment-1080407556
