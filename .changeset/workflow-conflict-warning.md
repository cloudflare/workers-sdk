---
"wrangler": minor
---

Add confirmation prompt when deploying workflows with names that belong to different workers.

When deploying a workflow with a name that already exists and is currently associated with a different worker script, Wrangler will now display a warning and prompt for confirmation before proceeding. This helps prevent accidentally overriding workflows.
