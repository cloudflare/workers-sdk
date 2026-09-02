---
"wrangler": minor
---

Add a `--json` flag to the `wrangler workflows` commands

Every `wrangler workflows` command now accepts `--json`, which emits the raw API payload instead of the human-readable rendering. The formatted output remains the default, so existing usage is unaffected:

`wrangler workflows instances list my-workflow --json`

The JSON output carries raw values rather than a serialisation of the formatted view: ISO timestamps instead of locale-formatted dates, plain status strings instead of emojified labels, and no presentation-only derived fields.
