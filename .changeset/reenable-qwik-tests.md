---
"create-cloudflare": patch
---

Re-enable Qwik E2E tests after upstream eslint conflict fix

The Qwik E2E tests were quarantined because upstream `create-qwik` installed `@eslint/js` at "latest", which resolved to v10 and conflicted with the project's eslint 9.x. This has been fixed in `create-qwik@1.19.1`, so the tests are now re-enabled.
