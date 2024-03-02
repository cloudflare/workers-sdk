# 🚥 queues

This Worker implements a `PUT` endpoint that queues jobs on a queue, storing results in a KV namespace, and a `GET` endpoint that retrieves results from KV. Each job converts the request body to uppercase.

| Test                                                                                    | Overview                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [queue-consumer-integration-self.test.ts](test/queue-consumer-integration-self.test.ts) | `queue` handler integration test using `SELF`                                   |
| [queue-consumer-unit.test.ts](test/queue-consumer-unit.test.ts)                         | Unit tests calling `worker.queue()` directly                                    |
| [queue-producer-integration-self.test.ts](test/queue-producer-integration-self.test.ts) | Integration tests for endpoints using `SELF`                                    |
| [queue-producer-unit.test.ts](test/queue-producer-unit.test.ts)                         | Unit tests calling `worker.fetch()` directly mocking enqueuing and the consumer |
