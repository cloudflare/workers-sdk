# ⚡️ pages-functions-unit-integration-self

This project uses Pages Functions. Integration tests dispatch events using the `SELF` helper from the `cloudflare:test` module. Unit tests call handler functions directly. [`global-setup.ts`](global-setup.ts) builds Pages Functions into a Worker for integration testing, watching for changes.

| Test                                                      | Overview                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| [integration-self.test.ts](test/integration-self.test.ts) | Basic `fetch` integration test using `SELF` **(recommended)** |
| [unit.test.ts](test/unit.test.ts)                         | Basic unit test calling `worker.fetch()` directly             |
