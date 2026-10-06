---
"wrangler": patch
---

Refresh remote preview tokens before their session expires during long-running development

Reloads now preserve the session's refresh deadline, and failed refreshes retry with backoff instead of leaving remote bindings unusable until restart.
