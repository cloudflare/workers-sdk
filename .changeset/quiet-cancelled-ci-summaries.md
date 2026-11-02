---
"@cloudflare/devprod-status-bot": patch
---

Suppress Version Packages CI alerts for test summaries that failed only because their dependencies were cancelled

Check the summary's test partitions or framework shards before sending an alert. Genuine failures and timeouts still alert, and alerts are retained if GitHub cannot confirm the dependency results.
