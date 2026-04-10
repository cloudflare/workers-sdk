---
"miniflare": minor
"wrangler": minor
---

Add support for `agent_memory` bindings

Agent Memory bindings allow Workers to connect to Cloudflare's Agent Memory service for storing and retrieving agent conversation state. This binding is remote-only, meaning it always connects to the Cloudflare API during `wrangler dev` rather than using a local simulation.

To configure an `agent_memory` binding, add the following to your `wrangler.json`:

```jsonc
{
  "agent_memory": [
    {
      "binding": "MY_MEMORY",
      "namespace": "my-namespace"
    }
  ]
}
```

Wrangler will automatically provision the namespace during deployment if it does not already exist. Type generation via `wrangler types` is also supported.
