---
"wrangler": minor
---

Add event-code support to temporary Worker deployments

Use `wrangler deploy --temporary --event-code <code>` to provision an account for an event. Wrangler requires explicit server acknowledgement before caching the account and keeps the event code out of its cache and telemetry.
