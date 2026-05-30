---
"wrangler": patch
---

Bump `rosie-skills` from `0.7.6` to `0.8.1` and bundle it into the Wrangler output

The new version of `rosie-skills` is a [pure-TypeScript rewrite](https://github.com/withastro/rosie/pull/21) that removes the previously necessary ~600kb WASM binary. The package now ships only JavaScript with two minimal dependencies (`modern-tar` and `diff`).

Additionally, `rosie-skills` is now bundled directly into Wrangler's distributable rather than kept as an external runtime dependency. This eliminates the supply chain concern raised in [#14110](https://github.com/cloudflare/workers-sdk/issues/14110): there is no separate package to resolve at install time, since all code is inlined into Wrangler's build output.
