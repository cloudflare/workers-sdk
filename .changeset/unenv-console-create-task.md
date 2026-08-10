---
"@cloudflare/unenv-preset": patch
---

Fix `console.createTask()` being missing from `node:console` in deployed Workers

Unlike the rest of the console API, `createTask()` is installed by the V8 inspector rather than by V8 itself, so it is only present on the runtime console when an inspector is attached to the isolate. Because the `node:console` polyfill read it straight off the runtime console, `console.createTask` (and `import { createTask } from "node:console"`) was a function during `wrangler dev` but `undefined` in deployed Workers.

The polyfill now falls back to the unenv implementation when the runtime does not provide one, so the shape of `node:console` no longer depends on whether an inspector happens to be attached. This only affects Workers using the polyfill, i.e. those with a compatibility date before `2025-09-21` that do not set the `enable_nodejs_console_module` compatibility flag — workerd's native `node:console` module already installs its own `createTask()` stub.
