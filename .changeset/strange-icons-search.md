---
"wrangler": patch
---

feat: inject `process.env.NODE_ENV` into scripts

An extremely common pattern in the js ecosystem is to add additional behaviour gated by the value of `process.env.NODE_ENV`. For example, React leverages it heavily to add dev-time checks and warnings/errors, and to load dev/production versions of code. By doing this substitution ourselves, we can get a significant runtime boost in libraries/code that leverage this.

This does NOT tackle the additional features of either minification, or proper node compatibility, or injecting wrangler's own environment name, which we will tackle in future PRs.
