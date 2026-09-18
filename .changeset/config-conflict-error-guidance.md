---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Explain how to resolve a user/deploy configuration conflict

When a user configuration file and a `.wrangler/deploy/config.json` were found under different base paths, the error stated the conflict but gave no way out of it, leaving the reader to guess whether to move a file, delete one, or run the command somewhere else.

The message now names the path the deploy configuration would have to sit at to apply, suggests deleting it when it is left over from a previous build or running the command from the directory that owns the intended configuration, and links to the Generated Wrangler configuration documentation.
