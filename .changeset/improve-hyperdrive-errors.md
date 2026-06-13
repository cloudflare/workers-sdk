---
"wrangler": patch
---

Improve Hyperdrive error messages for missing required options

Error messages thrown when creating or updating a Hyperdrive config with missing individual parameters (e.g. `--origin-host`, `--origin-port`, `--database`, `--origin-user`, `--origin-password`, `--origin-scheme`, `--access-client-id`/`--access-client-secret`) now clearly state which option is missing, provide a usage example, and suggest `--connection-string` as an alternative where applicable.
