---
"wrangler": minor
---

Add `wrangler workflows concurrency` commands to manage Workflow step concurrency keys

Concurrency keys limit how many Workflow steps can run at once across an account. They could only be managed through the API; the new open beta commands cover the full lifecycle:

- `wrangler workflows concurrency list`
- `wrangler workflows concurrency create <name> --limit <n>`
- `wrangler workflows concurrency get <key>`
- `wrangler workflows concurrency update <key> --limit <n>`
- `wrangler workflows concurrency delete <key>`

`<key>` accepts the key's name, as referenced by steps, or its ID. Every command supports `--json`, and `delete` asks for confirmation unless `--force` is passed.
