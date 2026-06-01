---
"wrangler": patch
---

Fix `wrangler whoami` printing a trailing period after the api-tokens URL

The message `To see token permissions visit https://...api-tokens.` ended with a period that became part of the URL when clicked in terminals or GitHub Actions output, causing a 404. The period is removed and a comma added before "visit" so the sentence reads naturally without a trailing period on the URL.
