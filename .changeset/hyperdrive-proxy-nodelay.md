---
"miniflare": patch
---

Remove a 40 ms delay from Hyperdrive queries in local dev

Miniflare's local Hyperdrive proxy left Nagle's algorithm on for its sockets. A Postgres driver that sends one query in several small writes, such as `pg` for every query with parameters, had the later writes held back until the database acknowledged the first, which took about 40 ms per query. Large results were held back the same way on the way back to the Worker.

The proxy now turns on `noDelay` for the connection from the Worker and for the connection to the database. Connection strings using `sslmode=disable` are unaffected, since that mode connects directly and skips the proxy.
