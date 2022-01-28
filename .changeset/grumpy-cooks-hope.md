---
"wrangler": patch
---

test: support testing in CI on Windows

- Don't rely on bash variables to configure tests
  The use of bash variables in the `npm test` script is not supported in Windows Powershell, causing CI on Windows to fail.
  These bash variables are used to override the API token and the Account ID.

  This change moves the control of mocking these two concepts into the test code, by adding `mockAccountId()` and `mockApiToken()` helpers.

  - The result is slightly more boilerplate in tests that need to avoid hitting the auth APIs.
  - But there are other tests that had to revert these environment variables. So the boilerplate is reduced there.

- Sanitize command line for snapshot tests
  This change applies `normalizeSlashes()` and `trimTimings()` to command line outputs and error messages to avoid inconsistencies in snapshots.
  The benefit here is that authors do not need to keep adding them to all their snapshot tests.

- Move all the helper functions into their own directory to keep the test directory cleaner.
