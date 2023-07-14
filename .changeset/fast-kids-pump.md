---
"wrangler": patch
---

Wrangler Capnp Compilation

This PR modifies the internal logfwdr binding to accept uncompiled capnp schemas, and makes Wrangler compile them instead. Additionally, it adds an optional `capnp_schema` property to `unsafe.bindings`, to include it as an additional file to compile. The capnp source prefix option can be specified with an optional `capnp_src_prefix` property in the wrangler.toml, defaulting to the cwd.
