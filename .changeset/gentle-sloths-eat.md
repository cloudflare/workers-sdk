---
"wrangler": minor
---

Support service bindings from Pages projects to Workers in a single `workerd` instance. To try it out, pass multiple `-c` flags to Wrangler: i.e. `wrangler pages dev -c wrangler.toml -c ../other-worker/wrangler.toml`. The first `-c` flag must point to your Pages config file, and the rest should point to Workers that are bound to your Pages project.
