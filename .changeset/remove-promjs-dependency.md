---
"@cloudflare/edge-preview-authenticated-proxy": patch
"@cloudflare/playground-preview-worker": patch
"@cloudflare/format-errors": patch
---

Replace deprecated `promjs` library with `MetricsRegistry` from `@cloudflare/workers-utils/metrics`

The `promjs` library has been unmaintained since 2022 and has a broken `package.json` requiring workarounds. It has been replaced with a lightweight `MetricsRegistry` class in `@cloudflare/workers-utils/metrics` that produces byte-identical Prometheus text exposition format output.
