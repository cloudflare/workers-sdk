# 🤯 rpc

This Worker defines `WorkerEntrypoint` default and named exports. It also defines Durable Objects subclassing `DurableObject`. All of these classes define properties and methods that can be called over RPC. Integration tests dispatch events, access properties and call methods using the `SELF` helper from the `cloudflare:test` module.

| Test                                                      | Overview                                     |
| --------------------------------------------------------- | -------------------------------------------- |
| [integration-self.test.ts](test/integration-self.test.ts) | Integration test using `SELF`                |
| [unit.test.ts](test/unit.test.ts)                         | Unit tests calling exported classes directly |
