---
"wrangler": patch
---

Normalize structural CRLF line endings before sending D1 commands to the remote query API

`wrangler d1 migrations apply --remote` and `wrangler d1 execute --remote --command` failed with `incomplete input: SQLITE_ERROR` when the SQL contained CRLF line endings inside a compound statement such as a `CREATE TRIGGER ... BEGIN ... END;` body. Structural line endings are now normalized to LF before the command is sent to the D1 query API, while CRLF inside quoted values and identifiers remains unchanged.
