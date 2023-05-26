---
"wrangler": patch
---

Replace the SQL statement splitter with a trimmer that removes BEGIN TRANSACTION/COMMIT from SQL files sent to the API (since D1 already wraps executed SQL in a transaction for users), and the new backend can handle large SQL dumps.
