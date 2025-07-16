---
"miniflare": minor
---

add `structuredWorkerdLogs` option

add a new top-level option named `structuredWorkerdLogs` that makes workerd print to stdout structured logs (stringified jsons of the following shape: `{ timestamp: number, level: string, message: string }`) instead of printing logs to stdout and stderr
