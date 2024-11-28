---
"wrangler": minor
---

Improve Wrangler's multiworker support to allow running multiple workers at once with one command. To try it out, pass multiple `-c` flags to Wrangler: i.e. `wrangler dev -c wrangler.toml -c ../other-worker/wrangler.toml`. The first config will be treated as the _primary_ worker and will be exposed over HTTP as usual (localhost:8787) while the rest will be treated as _secondary_ and will only be accessible via a service binding from the primary worker. Notably, these workers all run in the same runtime instance, which should improve reliability of multiworker dev and fix some bugs (RPC to cross worker Durable Objects, for instance).
