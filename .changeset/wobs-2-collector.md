---
"miniflare": minor
---

Experimental: add an internal SQLite store for local-dev observability traces

Builds on the local-observability opt-in. The collector worker now hosts an internal SQLite-backed Durable Object (`TraceStore`) that owns captured spans + logs, and exposes a single read-only SQL endpoint over it (`POST /query`) for the Local Explorer and coding agents to consume. `/query` accepts one `SELECT`/`WITH` statement with bound `params`, rejects anything that could mutate the store (writes, DDL, `PRAGMA`, `ATTACH`, or a second statement), and caps the rows returned — the `spans`/`logs` schema is the read contract. A trace is stored as a root span (`parent_id IS NULL`) plus its descendants, with invocation-level data (HTTP status, cpu/wall time, trigger, worker metadata) folded into the span's `attributes`. Folding each worker's streaming tail into these rows is a follow-up; for now `tailStream` is a no-op placeholder.
