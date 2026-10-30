---
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-auth": minor
"@cloudflare/remote-bindings": minor
---

Support `CLOUDFLARE_AUTH_PROFILE` for shared authentication profile selection

Cloudflare tooling can pass a selected profile to child processes through `CLOUDFLARE_AUTH_PROFILE`. Explicit profile arguments take precedence over the variable, followed by directory bindings and the default profile. The `cf-wrangler` development delegate also initializes cf authentication so it reads the selected cf credentials.

Experimental cf development delegates inherit the selected profile without additional command-line flags. Vite refreshes remote authentication when the resolved profile changes, and `cf-wrangler` keeps its authentication scoped to the delegate invocation.
