---
"miniflare": patch
---

fix: add hyperdrive bindings support in `getBindings`

Note: the returned binding values are no-op/passthrough that can be used inside node.js, meaning
that besides direct connections via the `connect` methods, all the other values point to the
same db connection specified in the user configuration
