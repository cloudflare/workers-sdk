---
"wrangler": minor
---

Add `--json`, `--csv`, and `--sql-file` flags to `wrangler r2 sql query`

The R2 SQL query command now supports multiple output formats and file-based query input:

- `--json`: Output results as a JSON array, suitable for piping to `jq` or other tools
- `--csv`: Output results as RFC 4180-compliant CSV with header row
- `--sql-file`: Read the SQL query from a `.sql` file instead of passing it as an argument

The metrics line now includes the R2 request count alongside bytes scanned and files scanned. `EXPLAIN FORMAT JSON` queries are automatically pretty-printed.

```
wrangler r2 sql query <warehouse> "SELECT * FROM ns.table" --json
wrangler r2 sql query <warehouse> --sql-file query.sql --csv
```
