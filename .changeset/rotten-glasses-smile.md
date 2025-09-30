---
"wrangler": patch
---

Improves the Wrangler auto-provisioning feature by:
- Writing back changes to the user's config file (not necessary, but can make it resilient to binding name changes)
- Fixing --dry-run
- Fixing bindings view for specific versions to not display TOML
