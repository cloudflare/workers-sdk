---
"wrangler": patch
---

Improve error message when deploying to a non-existent Pages project in non-interactive mode

Previously, running `wrangler pages deploy` with a `--project-name` that doesn't exist in a non-interactive context (e.g. CI, piped input) would fail with a generic "project not found" or "This command cannot be run in a non-interactive context" error. Now it provides a specific error message explaining that the project doesn't exist and suggests how to create it. The error also suggests using `wrangler deploy` to deploy a Worker instead.
