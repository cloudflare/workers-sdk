---
"wrangler": patch
---

fix: ensure `console.log()`s during startup are displayed

Previously, `console.log()` calls before the Workers runtime was ready to
receive requests wouldn't be shown. This meant any logs in the global scope
likely weren't visible. This change ensures startup logs are shown. In particular,
this should [fix Remix's HMR](https://github.com/remix-run/remix/issues/7616),
which relies on startup logs to know when the Worker is ready.
