---
"miniflare": patch
---

Stop local D1 reads outside sessions from writing to the database file

Before, local D1 stored a new session bookmark for each query. Thus, each `SELECT` committed a write transaction with a WAL append and an fsync. Now, local D1 gets a bookmark only when the request has a session bookmark or constraint. Requests from a `withSession()` session and `query()` calls with a `bookmark` have one. Other queries do not get a bookmark. Production D1 operates in the same way.
