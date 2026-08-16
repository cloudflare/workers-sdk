---
"wrangler": patch
---

fix: recognise compound statement markers that are not padded with whitespace

`wrangler d1 execute --file` and `wrangler d1 migrations apply` split a SQL file into statements before sending them to D1. The splitter only recognised `BEGIN`, `CASE` and `END` when they were surrounded by whitespace, so SQL that SQLite accepts, such as a trigger body ending in `INSERT ...;END;` or a trigger declared with `WHEN (1=1)BEGIN`, was split incorrectly: statements after the trigger were swallowed into it and silently sent as a single statement.

Markers are now matched when delimited by punctuation as well, while identifiers that merely end in a keyword, such as a `weekend` table, are still left alone.
