---
"@cloudflare/vitest-plugin": patch
---

Fix slowdowns and crashes in tests that repeatedly recreate Durable Objects

Tests that construct the same Durable Object many times could get progressively slower and eventually fail with a stack overflow. Repeated constructions now behave the same as the first one.
