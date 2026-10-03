---
"@cloudflare/config": minor
---

Generate Node.js process environment types for experimental Worker configuration

Text, JSON, and secret bindings now appear in `NodeJS.ProcessEnv` when compatibility settings enable environment population. Resource bindings stay excluded, and bindings only present in some configuration branches remain optional.
