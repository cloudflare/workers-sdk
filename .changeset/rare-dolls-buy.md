---
"wrangler": patch
---

add options to readConfig() to control how we deal with missing environment definitions

This will be used by the Vite plugin, since (unless otherwise specified) the `vite dev` command will set the environment
to "development", and `vite build` will set the environment to "production".
We don't want the user to have to define these environments explicitly in their Wrangler config if they don't want to.

So when our Vite plugin is calling `readConfig()` it can set the following two options:

- `allowEnvironmentsWhenNoneAreDefined: true` - this will tell Wrangler that it is OK for the Wrangler configuration to have no environments, even though the plugin will request either "development" or "production".
- `optionalEnvironments: ["development"]` - this will tell Wrangler that it is OK for the Wrangler configuration to omit the "development" environment, even if other environments are defined.
