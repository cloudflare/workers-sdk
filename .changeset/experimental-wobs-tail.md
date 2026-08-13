---
"wrangler": minor
---

Add experimental `--experimental-wobs-tail` flag to `wrangler tail`

The hidden `--experimental-wobs-tail` flag (alias `--x-wobs-tail`) streams your Worker's logs, invocations, and spans through Workers Observability instead of the classic tail. The `--status`, `--method`, `--search`, and `--version-id` filters are supported, along with both `pretty` and `json` output formats. Like the classic tail, it automatically reconnects after a dropped connection.

The default `wrangler tail` behavior is unchanged. The `--header`, `--sampling-rate`, `--ip`, and `--debug` options are not yet supported with this flag and will produce an error if used.
