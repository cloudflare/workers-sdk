---
"miniflare": patch
---

Return metadata in queue broker response

The queue broker's `/message` and `/batch` endpoints now return a JSON response body containing queue metrics (`backlogCount`, `backlogBytes`, `oldestMessageTimestamp`) instead of an empty response. A new `GET /metrics` endpoint is also added to support the `metrics()` API.
