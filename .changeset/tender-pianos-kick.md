---
"wrangler": patch
---

feat: Publish Origin Messaging
feat: warn about potential conflicts during `publish` and `init --from-dash`.

- If publishing to a worker that has been modified in the dashboard, warn that the dashboard changes will be overwritten.
- When initializing from the dashboard, warn that future changes via the dashboard will not automatically appear in the local Worker config.

resolves #1737
