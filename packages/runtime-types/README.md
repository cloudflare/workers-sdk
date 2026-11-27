# `@cloudflare/runtime-types`

Utilities for generating Cloudflare Workers runtime types from compatibility dates and flags.

This is not yet stable enough for external use — APIs may change without notice.

Importing this package and using its header helpers does not load Miniflare or
resolve the workerd binary. `generateRuntimeTypes()` loads workerd when called to
check the runtime version, and loads Miniflare only when types need to be generated.
This lets tools share the package with commands that do not need a local runtime.
