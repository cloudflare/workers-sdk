---
"wrangler": patch
---

Add back support for wrangler d1 exports with multiple tables.

Example:

```bash
# All tables (default)
wrangler d1 export db --output all-tables.sql

# Single table (unchanged)
wrangler d1 export db --output single-table.sql --table foo

# Multiple tables (new)
wrangler d1 export db --output multiple-tables.sql --table foo --table bar
```
