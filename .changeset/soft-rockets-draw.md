---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Support `CLOUDFLARE_ENV` environment variable for selecting the active environment

This change enables users to select the environment for commands such as `CLOUDFLARE_ENV=prod wrangler versions upload`. The `--env` command line argument takes precedence.

The `CLOUDFLARE_ENV` environment variable is mostly used with the `@cloudflare/vite-plugin` to select the environment for building the Worker to be deployed. This build also generates a "redirected deploy config" that is flattened to only contain the active environment.
To avoid accidentally deploying a version that is built for one environment to a different environment, there is an additional check to ensure that if the user specifies an environment in Wrangler it matches the original selected environment from the build.
