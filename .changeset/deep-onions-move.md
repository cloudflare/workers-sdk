---
"wrangler": minor
---

Interactively handle `wrangler deploy`s that are probably assets-only, where there is no config file and flags are incorrect or missing.

For example:

`npx wrangler deploy ./public` will now ask if you meant to deploy a folder of assets only, ask for a name, set the compat date and then ask whether to write your choices out to `wrangler.json` for subsequent deployments.

`npx wrangler deploy --assets=./public` will now ask for a name, set the compat date and then ask whether to write your choices out to `wrangler.json` for subsequent deployments.

In non-interactive contexts, Wrangler will error as it currently does.
