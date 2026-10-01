---
"miniflare": minor
---

Keep local development responsive while capturing observability data

Local observability now records high volumes of spans and logs with less impact on the main Worker, making local requests faster and more responsive. If observability data arrives faster than it can be stored, completed entries are dropped rather than slowing the Worker; the buffer size can be tuned with `X_LOCAL_OBSERVABILITY_BATCH_SIZE`.
