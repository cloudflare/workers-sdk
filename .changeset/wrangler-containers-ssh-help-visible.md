---
"wrangler": patch
---

Show `containers ssh` in `wrangler containers --help` and in `wrangler containers ssh --help`

The `containers ssh` command was previously hidden, so it did not appear in the list of subcommands shown by `wrangler containers --help`, and its description was omitted from `wrangler containers ssh --help`. The command is now listed with its description in both places.
