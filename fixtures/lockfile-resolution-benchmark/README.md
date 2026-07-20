# Lockfile resolution benchmark

This fixture compares dry-run deploy performance between the workspace Wrangler
and the prerelease from PR
[#14703](https://github.com/cloudflare/workers-sdk/pull/14703).

Its `test:ci` script warms both CLIs, runs five alternating trials, and prints a
single timing summary. The fixture test suite runs automatically on Linux,
macOS, and Windows in the main CI workflow.

Run it locally from the repository root with:

```sh
pnpm test:ci --filter @fixture/lockfile-resolution-benchmark
```
