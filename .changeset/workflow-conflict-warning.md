---
"wrangler": patch
---

Add confirmation prompt when deploying workflows with names that belong to different workers.

When deploying a workflow with a name that already exists and is currently associated with a different worker script, Wrangler will now display a warning and prompt for confirmation before proceeding. This helps prevent accidentally overriding workflows.

In non-interactive environments this check is skipped by default. Use the `--strict` flag to enable the check in non-interactive environments, which will cause the deployment to fail if workflow conflicts are detected.
