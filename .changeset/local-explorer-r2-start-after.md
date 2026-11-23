---
"miniflare": patch
---

Honor `start_after` when listing R2 objects through the Local Explorer API

Previously, the local R2 list objects endpoint ignored the `start_after` query parameter, so a listing resumed from a saved key returned that key again. Local listings now only return objects whose keys sort after `start_after`, matching the R2 list objects API.
