# 🚰 pipelines

This Worker implements endpoint that send details of the incoming HTTP request to a Pipeline.

| Test                                                                                  | Overview                                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [pipeline-send-integration-self.test.ts](test/pipeline-send-integration-self.test.ts) | Integration tests for endpoints using `SELF`                      |
| [pipeline-send-unit.test.ts](test/pipeline-send-unit.test.ts)                         | Unit tests calling `worker.fetch()` directly mocking the Pipeline |
