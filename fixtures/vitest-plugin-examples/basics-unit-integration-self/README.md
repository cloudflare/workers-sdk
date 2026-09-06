# ✅ basics-unit-integration-self

This Worker contains basic `fetch` and `scheduled` handlers. Integration tests dispatch events using `exports` from the `cloudflare:workers` module. Unit tests call handler functions directly.

| Test                                                                          | Overview                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| [fetch-integration-self.test.ts](test/fetch-integration-self.test.ts)         | Basic `fetch` integration test using `exports`        |
| [fetch-unit.test.ts](test/fetch-unit.test.ts)                                 | Basic unit test calling `worker.fetch()` directly     |
| [scheduled-integration-self.test.ts](test/scheduled-integration-self.test.ts) | Basic `scheduled` integration test using `exports`    |
| [scheduled-unit.test.ts](test/scheduled-unit.test.ts)                         | Basic unit test calling `worker.scheduled()` directly |
