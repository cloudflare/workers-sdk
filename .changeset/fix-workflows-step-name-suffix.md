---
"miniflare": patch
---

fix: Preserve internal counter suffix on workflow step names in local explorer API

Stop stripping the `-N` suffix from step names in the API response so the UI can distinguish duplicate step names. The suffix is now stripped only visually in the UI.
