---
"miniflare": minor
---

Updated dev registry to track worker dependencies to enable the vite plugin to determine which named entrypoints should be exposed across dev sessions

- `unsafeDevRegistry` now includes worker dependencies information when registering workers
- `unsafeHandleDevRegistry` callback is now invoked on all registry updates and receives additional context including previous registry state and current worker dependencies.
