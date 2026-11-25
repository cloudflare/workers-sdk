---
"miniflare": patch
---

Fix local Artifacts sometimes failing to start with `ERR_ADDRESS_IN_USE`

Miniflare chose a free port for an Artifacts namespace's Git remote, released it, and had workerd bind it later, so another process could take the port in between. Miniflare now keeps listening on the Git port itself and forwards connections to workerd, which binds a port of its own choosing.
