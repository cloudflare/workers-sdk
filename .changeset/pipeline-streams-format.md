---
"wrangler": minor
---

**Breaking Change for compatibility_date >= "2025-10-22":** Updated pipeline bindings configuration format.

For compatibility_date >= "2025-10-22", pipelines now use a new configuration format:

**New format (compatibility_date >= "2025-10-22"):**

```toml
compatibility_date = "2025-10-22"

[pipelines.streams]
binding = "MY_STREAM"
stream = "stream-id-1"

[pipelines.streams]
binding = "ANOTHER_STREAM"
stream = "stream-id-2"
```

**Legacy format (compatibility_date < "2025-10-22"):**

```toml
compatibility_date = "2024-12-01"

[[pipelines]]
binding = "MY_PIPELINE"
pipeline = "pipeline-id-1"

[[pipelines]]
binding = "ANOTHER_PIPELINE"
pipeline = "pipeline-id-2"
```

Both formats produce identical runtime bindings. The new format provides better structure for future pipeline features and aligns with modern configuration patterns.

This change only affects the configuration format - the runtime API and binding behavior remain unchanged, since in the new Pipelines API, streams are functionally the same as the legacy pipelines.
