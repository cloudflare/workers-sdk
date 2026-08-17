---
"wrangler": patch
---

Fix the D1 SQL statement splitter under-splitting migration files that contain a `CASE ... END` expression whose `END` is immediately followed by a comma or closing paren rather than whitespace

The splitter tracks nested `BEGIN`/`CASE` blocks so it doesn't split a semicolon that's inside a trigger body or a `CASE` expression. It detected the end of a block by checking whether `END` was followed by `;` or whitespace, but a `CASE` used as a value expression (for example `SET x = CASE ... END, y = 1`) is legitimately followed directly by a comma, and one used inside a function call or parenthesized expression can be followed by `)`. When that happened, the block's `END` went undetected, leaving the splitter's internal nesting tracker permanently one level too deep for the rest of the file — every remaining statement, however unrelated, got merged into one giant blob instead of being split correctly.

For `wrangler d1 migrations apply --local`, this could surface as a confusing `database table is locked: SQLITE_LOCKED` error partway through a migration, with the same file applying cleanly with `--remote`.
