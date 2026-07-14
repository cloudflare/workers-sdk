---
"wrangler": patch
---

Suggest similar commands when a typo is detected

When an unknown command or subcommand is entered, wrangler now suggests the closest matching command if one exists within a reasonable edit distance. For example, running `wrangler whoamio` will display `Did you mean "wrangler whoami"?`, and running `wrangler kv namespase` will display `Did you mean "wrangler kv namespace"?`.
