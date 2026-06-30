---
"wrangler": minor
---

Add `wrangler ai-search jobs` commands for managing AI Search indexing jobs

You can now list, trigger, inspect, cancel, and read the logs of indexing jobs for an AI Search instance:

```
wrangler ai-search jobs list <instance>
wrangler ai-search jobs create <instance> --description "manual reindex"
wrangler ai-search jobs get <instance> <job-id>
wrangler ai-search jobs cancel <instance> <job-id>
wrangler ai-search jobs logs <instance> <job-id>
```

All commands accept `--namespace`/`-n` (defaults to `default`) and `--json` for machine-readable output.
