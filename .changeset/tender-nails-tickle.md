---
"miniflare": patch
---

fix: ensure IPv6 addresses can be used as `host`s

Previously, if Miniflare was configured to start on an IPv6 `host`, it could crash. This change ensures IPv6 addresses are handled correctly. This also fixes `wrangler dev` when using IPv6 addresses such as `::1` with the `--ip` flag.
