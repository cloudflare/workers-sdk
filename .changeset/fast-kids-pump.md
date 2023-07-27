---
"wrangler": patch
---

Wrangler Capnp Compilation

This PR replaces logfwdr's `schema` property with a new `unsafe.capnp` object. This object accepts either a `compiled_schema` property, or a `base_path` and array of `source_schemas` to get Wrangler to compile the capnp schema for you.
