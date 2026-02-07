---
"miniflare": minor
---

feat: Add support for logging Durable Object alarm triggers

When a Durable Object alarm fires during local development and alarm-related
log messages are emitted by the runtime, they will now be formatted and displayed
in a readable format similar to HTTP request logs:

```
DO Alarm MyDurableObject - Ok
```

This improves visibility when debugging alarm-based logic in local development.
The alarm logs are detected and formatted from workerd's structured log output.
