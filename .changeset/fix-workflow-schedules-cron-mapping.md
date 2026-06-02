---
"wrangler": patch
---

Fix Workflows `schedules` deploy payload to match the control plane API

When deploying a Workflow with a `schedules` binding property, Wrangler sent the cron expressions as a list of strings. The Workflows API expects a list of objects of the form `{ cron: string }`, so the request was rejected. Wrangler now maps each configured cron expression to `{ cron }` (normalizing a single string or an array) when building the request. The user-facing config still accepts a string or an array of strings.
