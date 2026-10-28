---
"miniflare": minor
---

Support standalone local Flagship access through the Local Explorer API

You can now list, create, update, delete, and evaluate flags for any local Flagship app by its ID, even when no Worker binds it and no dev server is running. This lets `cf flagship` commands manage local flags with `--local`.

Explorer Flagship routes now follow the public Flagship API: evaluate moves to `/apps/{app_id}/evaluate`, full updates use `PUT`, and `PATCH` changes only `enabled`, `description`, `default_variation`, and `metadata`. Flag `metadata` is stored, validated, and returned in evaluation results.

Explorer requests are no longer routed to the development process that owns each app. To share flags between local processes, use the same persistence directory.
