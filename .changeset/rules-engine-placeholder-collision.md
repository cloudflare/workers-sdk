---
"@cloudflare/workers-shared": patch
---

Fix `_redirects`/`_headers` rules being silently dropped when two placeholders share a prefix

A rule such as `/p/:id/:id_2` compiled to a regex containing the `id` capture group twice, because each placeholder was substituted by splitting on its raw `:name` text — which also split inside the longer placeholder. The resulting `SyntaxError: Duplicate capture group name` was swallowed by the rule compiler's `catch`, so the rule was dropped with no diagnostic and simply never fired.

The same prefix collision corrupted substitution into the destination: `replacer("/dest/:id/:id_2", { id: "1", id_2: "2" })` returned `/dest/1/1_2` instead of `/dest/1/2`. Both functions now match whole placeholders in a single pass, which also stops a replacement value that happens to contain `:name` from being substituted again.
