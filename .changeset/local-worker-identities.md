---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Run experimental Worker identity bindings with a fully local authority

Local development now signs and verifies real credentials with isolated local keys, discovery, and SQLite replay protection. Cooperating Workers use exact local HTTPS origins without remote identity services. Hot reload preserves subjects and persisted restarts keep keys and replay state together. Local OAuth fixtures can verify real workload/client assertions, DPoP, and optional HTTP signatures.
