---
"wrangler": minor
"miniflare": minor
---

Force Flagship bindings to always use remote mode in local dev

Flagship bindings now always access the remote Flagship service during local development, matching the behavior of AI bindings. Previously, Flagship supported both local and remote modes, but the local stub only returned default values, providing no real functionality and creating a dual source of truth for flag evaluations.

The `remote` config field is retained for backward compatibility but only controls whether a warning is displayed. Setting `remote: true` suppresses the warning that Flagship bindings always access remote resources and may incur usage charges in local dev.
