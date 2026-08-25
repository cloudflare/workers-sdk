---
"@cloudflare/vitest-plugin": patch
---

Fix "Network connection lost" when multiple test files use remote bindings

Remote proxy sessions are shared across pool workers by Wrangler config path, but were disposed during each test file's teardown. Because Vitest starts the next file's worker before the previous one finishes stopping, later files reused an already-disposed session and failed with "Network connection lost". Sessions are now disposed only once the last pool worker stops.
