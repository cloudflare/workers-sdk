---
"wrangler": minor
---

Add new `autoconfig_summary` field to the deploy output entry

This change augments `wrangler deploy` output being printed to `WRANGLER_OUTPUT_FILE_DIRECTORY` or `WRANGLER_OUTPUT_FILE_PATH` to also include a new `autoconfig_summary` field containing the possible summary details for the autoconfig process (the field is `undefined` if autoconfig didn't run).

Note: the field is experimental and could change while autoconfig is not GA
