---
"@cloudflare/edge-preview-authenticated-proxy": patch
---

Release the Prometheus metrics migration to the internal `wshim` service binding

Metrics were previously pushed with a plain `fetch()` to `workers-logging.cfdata.org`, which stopped working. The push was moved to the `WSHIM_SOCKET` binding in #14704, but that change was never released, so it never reached production and the Worker has been reporting no request/error counters since.
