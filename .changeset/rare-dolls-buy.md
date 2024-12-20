---
"wrangler": patch
---

add options to readConfig() to specify control how we deal with missing environment definitions

This will be used by the Vite plugin, since vite dev command will always set the environment
to "development", and we don't want the user to have to define this explicitly if they don't want to.
In such cases there is no need for the user to define this environment explicitly,
even if there are other environments defined.
