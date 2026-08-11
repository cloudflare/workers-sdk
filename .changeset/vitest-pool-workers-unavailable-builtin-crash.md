---
"@cloudflare/vitest-pool-workers": patch
---

Report built-in modules that a Worker's compatibility settings don't provide as module errors, instead of crashing workerd

Previously, a Worker whose module graph statically reached a compatibility-gated built-in that wasn't enabled — for example `import "node:child_process"` without `nodejs_compat` — took down the runtime with `*** Received signal #11: Segmentation fault` before any test ran. Vitest reported only `Worker exited unexpectedly`, naming neither the module nor the file that imported it, which made the cause very hard to find. The import didn't even have to be called; being reachable from the entrypoint was enough.

The module fallback service answered these specifiers with a redirect to the modules root, but workerd already resolves `node:`/`cloudflare:`/`workerd:` specifiers there, so the redirect pointed back at the module workerd was in the middle of resolving and it recursed until the stack overflowed. Such a specifier only reaches the fallback service when workerd's own registry has already missed, so it's now reported as not found: workerd raises `No such module "node:child_process"`, matching what `wrangler dev` does for the same Worker. The accompanying pool error names the module and points at compatibility flags rather than suggesting you bundle it, which can't help for a module built into the runtime.
