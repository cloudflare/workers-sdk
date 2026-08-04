---
"wrangler": patch
---

Recognise a lowercase `end` when splitting D1 SQL into statements

`wrangler d1 execute --file` and `wrangler d1 migrations apply` only treated an uppercase `END` as the terminator of a `BEGIN`/`CASE` compound statement, even though the opening `BEGIN`/`CASE` marker is matched case-insensitively. A trigger body closed with `end;` therefore never ended, and every following statement in the file was swallowed into it and executed as one statement.

The closing marker is now matched case-insensitively too.
