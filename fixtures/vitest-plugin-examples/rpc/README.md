# 🤯 rpc

This Worker defines `WorkerEntrypoint` default and named exports. It also defines Durable Objects subclassing `DurableObject`. All of these classes define properties and methods that can be called over RPC. Integration tests dispatch events, access properties and call methods via `exports` imported from `cloudflare:workers`.

| Test                                                      | Overview                                     |
| --------------------------------------------------------- | -------------------------------------------- |
| [integration-self.test.ts](test/integration-self.test.ts) | Integration test using `exports`             |
| [unit.test.ts](test/unit.test.ts)                         | Unit tests calling exported classes directly |
