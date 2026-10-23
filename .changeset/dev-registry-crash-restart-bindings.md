---
"miniflare": patch
---

Keep cross-process bindings working after a `workerd` crash restart

Bindings to Workers running in another dev session are rerouted through the dev registry proxy. That reroute used to rewrite the stored worker options in place, so when Miniflare restarted `workerd` after a crash and assembled the config again from the same options, it rerouted the proxy binding through itself. Every call over a cross-process service binding, Durable Object binding or tail consumer then failed with `Worker "dev-registry-proxy" not found` until the options were next updated. The reroute now works on copies of the options, so a restarted runtime routes those bindings to the other dev session as before.
