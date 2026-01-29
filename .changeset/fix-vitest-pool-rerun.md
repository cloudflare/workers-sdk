---
"@cloudflare/vitest-pool-workers": patch
---

Fix test rerun crash when running all tests after running a subset

When using `isolatedStorage: true` without `singleWorker`, running a subset of tests first
(e.g., via VSCode or with a file filter) and then running all tests would crash with an
assertion error. This was because Miniflare instances were only created for test files
discovered during the initial run. Now, when reusing isolated Miniflare instances, new
instances are created for any newly discovered test files.
