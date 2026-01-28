---
"miniflare": minor
---

Implement local D1 API for experimental/WIP local resource explorer

The following APIs have been (mostly) implemented:

- `GET /d1/database` - Returns a list of D1 databases.
- `GET /d1/database/{database_id}` - Returns the specified D1 database.
- `POST /d1/database/{database_id}/raw` - Returns the query result rows as arrays rather than objects.
