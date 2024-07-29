# 📌 durable-objects

This Worker implements a counter with Durable Objects. Each object holds a single count.

| Test                                                | Overview                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| [direct-access.test.ts](test/direct-access.test.ts) | Tests for endpoints that also access object instance members directly |
| [alarm.test.ts](test/alarm.test.ts)                 | Tests that immediately execute object alarms                          |
