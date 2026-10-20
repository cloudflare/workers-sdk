---
"miniflare": minor
---

Add Workflow concurrency keys to the Local Explorer API

`/cdn-cgi/local/explorer/api/workflows/concurrency` lists, creates, updates and deletes the local concurrency keys, following the deployed `/workflows/concurrency` API and accepting a key's name in place of its ID. Keys also report how many steps hold and wait for them, and `/holders` and `/waiters` list those steps. Instance details now include `waiting_for`, the steps waiting for a key, and each keyed step reports its keys and when it acquired them.
