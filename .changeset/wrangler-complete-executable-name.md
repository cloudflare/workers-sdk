---
"wrangler": minor
---

Add `--executable-name` flag to `wrangler complete` to support `npx wrangler` and other invocation patterns

The generated completion script previously hardcoded `wrangler` as the executable name, so users invoking Wrangler through `npx wrangler` (the documented local-install workflow) got scripts that internally called `wrangler complete --` instead of `npx wrangler complete --`, breaking completions.

You can now override the embedded executable name for any shell:

`npx wrangler complete powershell --executable-name "npx wrangler"`
