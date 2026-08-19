---
"@cloudflare/workflows-shared": patch
---

Fix local `Workflow.deleteBatch()` reporting missing instances as deleted

Local batch deletion now checks whether each instance exists before clearing its storage, returns the same per-instance not-found error as production, and preserves positional duplicate results while deleting each unique instance once.
