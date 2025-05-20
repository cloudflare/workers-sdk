---
"wrangler": minor
---

Add support for FedRAMP High compliance region

Now it is possible to target Wrangler at the FedRAMP High compliance region.
There are two ways to signal to Wrangler to run in this mode:

- set `"compliance_region": "fedramp_high"` in a Wrangler configuration
- set `CLOUDFLARE_COMPLIANCE_REGION=fedramp_high` environment variable when running Wrangler

If both are provided then the environment variable overrides the configured value.

When in this mode OAuth authentication is not supported.
It is necessary to authenticate using a Cloudflare API Token acquired from the Cloudflare FedRAMP High dashboard.

Most bindings and commands are supported in this mode.

- Unsupported commands may result in API requests that are not supported - possibly 422 Unprocessable Entity responses.
- Unsupported bindings may work in local dev, as there is no local validation, but will fail at Worker deployment time.

Resolves DEVX-1921.
