---
"@cloudflare/unenv-preset": patch
---

Fix `console.createTask()` being missing from `node:console` in deployed Workers

`console.createTask()` — and `import { createTask } from "node:console"` — was available when running locally with `wrangler dev`, but was `undefined` once the Worker was deployed. Code that checked for it locally could therefore take a different path in production. It is now always defined.

In a deployed Worker it throws when called, because tagging async stack traces needs an attached debugger. This is the same behaviour as the built-in `node:console` that Workers get from a compatibility date of `2025-09-21` onwards, so only Workers on an earlier compatibility date without the `enable_nodejs_console_module` compatibility flag are affected.
