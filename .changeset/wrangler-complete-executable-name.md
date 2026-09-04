---
"wrangler": minor
---

Add `--executable-name` flag to `wrangler complete` to support `npx wrangler` and other invocation patterns

The generated completion script previously hardcoded `wrangler` as the executable name, so users invoking Wrangler through `npx wrangler` (the documented local-install workflow) got scripts that internally called `wrangler complete --` instead of `npx wrangler complete --`, breaking completions.

You can now override the embedded executable name for any shell:

`npx wrangler complete powershell --executable-name "npx wrangler"`

Since shells can only ever register completions against the first word actually typed, a multi-word `--executable-name` (like `"npx wrangler"`) registers completion against that first word (`npx`) and only activates once the following word(s) match the rest of the invocation, so pressing Tab after `npx wrangler` completes correctly without also firing for unrelated `npx <other-tool>` invocations.
