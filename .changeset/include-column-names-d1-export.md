---
"wrangler": patch
---

Include column names in D1 SQL export INSERT statements

D1 SQL exports now include column names in INSERT statements (e.g., `INSERT INTO "table" ("col1","col2") VALUES(...)`). This ensures that exported SQL can be successfully imported even when the target table has columns in a different order than the original, which commonly occurs during iterative development when schemas evolve.
