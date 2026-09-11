---
"create-cloudflare": patch
---

Update the default compatibility date for newly created projects to 2026-09-11

The default compatibility date tracks the pinned `workerd` release, which was bumped to `1.20260911.1`. Releasing C3 ships the updated date to `npm create cloudflare` users, since it is bundled into the published package.
