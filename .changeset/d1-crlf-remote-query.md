---
"wrangler": patch
---

Normalize CRLF line endings before sending D1 commands to the remote query API

`wrangler d1 migrations apply --remote` and `wrangler d1 execute --remote --command` failed with `incomplete input: SQLITE_ERROR` when the SQL contained CRLF line endings inside a compound statement such as a `CREATE TRIGGER ... BEGIN ... END;` body. The command string is now normalized to LF before it is sent to the D1 query API.
