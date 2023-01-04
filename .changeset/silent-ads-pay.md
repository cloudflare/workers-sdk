---
"wrangler": patch
---

fix(d1): ensure that migrations support compound statements

This fix updates the SQL statement splitting so that it does not split in the middle of compound statements.
Previously we were using a third party splitting library, but this needed fixing and was actually unnecessary for our purposes.
So a new splitter has been implemented and the library dependency removed.
Also the error handling in `d1 migrations apply` has been improved to handle a wider range of error types.

Fixes #2463
