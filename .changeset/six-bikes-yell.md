---
"triangle": patch
---

This PR implements a trimmer that removes BEGIN TRANSACTION/COMMIT from SQL files sent to the API (since the D1 API already wraps SQL in a transaction for users).
