---
"wrangler": minor
---

Add `wrangler queues consumer list` subcommands for listing queue consumers

Three new commands are available for listing consumers on a queue:

- `wrangler queues consumer list <queue-name>` — lists all consumers (both worker and HTTP pull), grouped by type
- `wrangler queues consumer worker list <queue-name>` — lists only worker consumers
- `wrangler queues consumer http list <queue-name>` — lists only HTTP pull consumers
