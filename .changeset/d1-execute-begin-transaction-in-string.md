---
"wrangler": patch
---

Stop `wrangler d1 execute` from rejecting SQL whose data mentions `BEGIN TRANSACTION`

The transaction guard used a plain `sql.includes("BEGIN TRANSACTION")` check, so any SQL whose string literals or comments happened to contain the phrase (for example updating a row to a value that explains how to remove `BEGIN TRANSACTION`/`COMMIT` from a dump) was wrongly rejected with "the provided SQL file ... contains several transactions". The phrase is now detected only when it appears as actual SQL, after masking out string/identifier literals and comments, so valid statements run as written while genuine multi-transaction dumps are still caught.
