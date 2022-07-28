---
"wrangler": patch
---

feat: legacy "kv-namespace" not supported
In previous Wrangler 1, there was a legacy configuration that was considered a "bug" and removed.
Before it was removed, tutorials, templates, blogs, etc... had utlized that configuration property
to handle this in Wrangler 2 we will throw a blocking error that tell the user to utilize "kv_namespaces"

resolves #1421
