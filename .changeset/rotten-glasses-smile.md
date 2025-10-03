---
"wrangler": patch
---

Improves the Wrangler auto-provisioning feature (gated behind the experimental flag `--x-provision`) by:

- Writing back changes to the user's config file (not necessary, but can make it resilient to binding name changes)
- Fixing --dry-run, which previously threw an error when your config file had auto provisioned resources
- Improve R2 bindings display to include the `bucket_name` from the config file on upload.
- Fixing bindings view for specific versions to not display TOML
