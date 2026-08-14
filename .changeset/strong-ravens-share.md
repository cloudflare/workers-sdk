---
"miniflare": minor
---

Expand and harden experimental shared local storage

Shared storage ownership is now scoped to the canonical persistence root, recovers when an owner exits, and requires shared, isolated, and dev-registry paths. Resources that do not yet support sharing use `isolatedResourcePersistencePath`, preserving their state across restarts without concurrent access to the shared root.
