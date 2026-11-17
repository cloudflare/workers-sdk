---
"@cloudflare/vite-plugin": minor
---

Remove the experimental internal `cf-vite` executable

Run development and builds through Vite's CLI or your framework's own commands instead. Configure `cloudflare({ remoteBindings: false })` to disable remote bindings.

When using the plugin through `cf`, upgrade to `cf@1.0.0-rc.0` or newer. This is the first cf release that runs the project's native Vite or Vite+ commands instead of the removed executable.
