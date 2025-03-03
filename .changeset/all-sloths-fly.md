---
"@cloudflare/vite-plugin": patch
---

chore: tweak a couple of error messages in the vite plugin

I was seeing an error like this: `Unexpected error: no match for module path.`. But it wasn't telling me what the path was. On debugging I noticed that it was telling me about the module "path"! Which meant I needed to enable node_compat. This patch just makes the messaging a little clearer.

(Ideally we'd spot that it was a node builtin and recommend turning on node_compat, but I'll leave that to you folks.)
