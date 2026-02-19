---
"@cloudflare/vitest-pool-workers": minor
---

Support Vitest 4 in `@cloudflare/vitest-pool-workers`.

This a breaking change to the `@cloudflare/vitest-pool-workers` integration in order to support Vitest v4. Along with supporting Vitest v4 (and dropping support for Vitest v2 and v3), we've made a number of changes that may require changes to your tests. Our aim has been to improve stability & the foundations of `@cloudflare/vitest-pool-workers` as we move towards a v1 release of the package.

We've made a codemod to make the migration easier: `wrangler codemod vitest-pool-v3-to-v4`, which will make the required changes to your config file.

- **`isolatedStorage` & `singleWorker`:** These have been removed in favour of a simpler isolation model that more closely matches Vitest. Storage isolation is now on a per test file basis, and you can make your test files share the same storage by using the Vitest flags `--max-workers=1 --no-isolate`
- **`import { env, SELF } from "cloudflare:test"`:** These have been removed in favour of `import { env, exports } from "cloudflare:workers"`. `exports.default.fetch()` has the same behaviour as `SELF.fetch()`, except that it doesn't expose Assets. To test your assets, use the `env.ASSETS` bindings or write an integration test using [`startDevWorker()` (recommended)](https://developers.cloudflare.com/workers/testing/unstable_startworker/)
- **`import { fetchMock } from "cloudflare:test"`:** This has been removed. Instead, [mock `globalThis.fetch`](https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-pool-workers-examples/request-mocking/test/imperative.test.ts) or use ecosystem libraries like [MSW (recommended)](https://mswjs.io/).
