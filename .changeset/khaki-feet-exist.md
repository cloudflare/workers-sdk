---
"wrangler": patch
---

wrangler dev now supports the HYPERDRIVE_LOCAL_CONNECTION_STRING environmental variable for connecting to a local database instance when testing Hyperdrive in local development. This environmental variable takes precedence over the localConnectionString set in wrangler.toml.
