---
"@cloudflare/workers-utils": patch
"@cloudflare/autoconfig": patch
"@cloudflare/build-output-utils": patch
"@cloudflare/cli-shared-helpers": patch
"@cloudflare/codemods": patch
"@cloudflare/config": patch
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/pages-functions": patch
"@cloudflare/pages-shared": patch
"@cloudflare/runtime-types": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-auth": patch
"create-cloudflare": patch
"miniflare": patch
"wrangler": patch
---

Pin workerd to 1.20261104.1 to keep D1 statements that reference a CTE many times working locally

As of workerd 1.20261108.1, statements that reference the same CTE (or view) more than ~100 times in one statement are rejected with `VIEWs and/or subqueries nested too deep: SQLITE_ERROR`, even when every reference sits in a flat list and the statement is never nested more than two levels deep. The regression arrived with the SQLite 3.54.1 upgrade in that workerd release and is tracked in [#16786](https://github.com/cloudflare/workers-sdk/issues/16786).

Until workerd ships an engine fix, this pins the bundled runtime to the last release before the upgrade so local D1 (`wrangler dev`, `wrangler d1 execute --local`) keeps accepting these statements, and `DEFAULT_COMPAT_DATE` follows the pinned release's compatibility date. The new Miniflare D1 regression test locks in the behaviour, so the pin can be lifted as soon as the engine fix lands. Note that this only affects local development: remote D1 is served by Cloudflare's D1 backend, whose engine fix must land independently.
