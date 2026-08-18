---
"@cloudflare/edge-preview-authenticated-proxy": patch
---

Fix missing request and error metrics for the edge preview proxy

The proxy stopped reporting its request and error counters, so dashboards and alerts based on them had no data. Metrics reporting now works again.
