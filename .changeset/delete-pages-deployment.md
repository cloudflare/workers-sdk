---
"wrangler": minor
---

Add `wrangler pages deployment delete` command to delete Pages deployments via CLI

You can now delete a Pages deployment directly from the command line:

```bash
wrangler pages deployment delete <deployment-id> --project-name <name>
```

Use the `--force` (or `-f`) flag to skip the confirmation prompt, which is useful for CI/CD automation.
