---
"miniflare": patch
---

Reduce Miniflare's bundle size by sharing Zod across embedded workers

Workflows, Email Store, and Local Explorer now import Zod from Miniflare's existing workerd extension instead of each bundling a separate copy.
