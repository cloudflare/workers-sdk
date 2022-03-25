---
"wrangler": patch
---

fix: setup jsx loaders when guessing worker format

- We consider jsx to be regular js, and have setup our esbuild process to process js/mjs/cjs files as jsx.
- We use a separate esbuild run on an entry point file when trying to guess the worker format, but hadn't setup the loaders there.
- So if just the entrypoint file has any jsx in it, then we error because it can't parse the code.

The fix is to add the same loaders to the esbuild run that guesses the worker format.

Reported in https://github.com/cloudflare/wrangler2/issues/701
