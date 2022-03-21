---
"wrangler": patch
---

fix: tighten up the named environment configuration

Now, when we normalize and validate the raw config, we pass in the currently
active environment name, and the config that is returned contains all the
environment fields correctly normalized (including inheritance) at the top
level of the config object. This avoids other commands from having to check
both the current named environment and the top-level config for such fields.

Also, now, handle the case where the active environment name passed in via the
`--env` command line argument does not match any of the named environments
in the configuration:

- This is an error if there are named environments configured;
- or only a warning if there are no named environments configured.
