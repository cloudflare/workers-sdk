# 🚀 hyperdrive

This Worker establishes a TCP connection with an echo server via Hyperdrive. The echo server is started/stopped by [global-setup.ts](global-setup.ts) on a random port, which is then provided to [vitest.config.mts](vitest.config.mts). In a real worker, Hyperdrive would be used with a database instead.

| Test                              | Overview                      |
| --------------------------------- | ----------------------------- |
| [echo.test.ts](test/echo.test.ts) | Integration test using `SELF` |
