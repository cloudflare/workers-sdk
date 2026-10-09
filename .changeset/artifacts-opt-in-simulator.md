---
"miniflare": minor
---

Add an opt-in local Artifacts binding simulator to Miniflare. Set `dev.remote: false` on an Artifacts binding to use persistent local repositories and authenticated Git smart HTTP backed by host Git 2.32 or newer. Omitted `dev.remote` retains the existing remote binding behavior.
