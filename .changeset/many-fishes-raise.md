---
"@cloudflare/vitest-pool-workers": minor
---

Support Vitest 4 in `@cloudflare/vitest-pool-workers`.

This a breaking change to the `@cloudflare/vitest-pool-workers` integration in order to support Vitest v4. Along with supporting Vitest v4 (and dropping support for Vitest v2 and v3), we've made a number of changes that may require changes to your tests. Our aim has been to improve stability & the foundations of `@cloudflare/vitest-pool-workers` as we move towards a v1 release of the package.

We've made a codemod to make the migration easier, which will make the required changes to your config file:

```sh
npx jscodeshift -t node_modules/@cloudflare/vitest-pool-workers/dist/codemods/vitest-v3-to-v4.mjs vitest.config.ts
```

Or, without installing the package first:

```sh
npx jscodeshift -t https://unpkg.com/@cloudflare/vitest-pool-workers/dist/codemods/vitest-v3-to-v4.mjs --parser=ts vitest.config.ts
```

- **Config API:** `defineWorkersProject` and `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config` have been replaced with a `cloudflareTest()` Vite plugin exported from `@cloudflare/vitest-pool-workers`. The `test.poolOptions.workers` options are now passed directly to `cloudflareTest()`:

  Before:

  ```ts
  import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

  export default defineWorkersProject({
  	test: {
  		poolOptions: {
  			workers: {
  				wrangler: { configPath: "./wrangler.jsonc" },
  			},
  		},
  	},
  });
  ```

  After:

  ```ts
  import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
  import { defineConfig } from "vitest/config";

  export default defineConfig({
  	plugins: [
  		cloudflareTest({
  			wrangler: { configPath: "./wrangler.jsonc" },
  		}),
  	],
  });
  ```

- **`isolatedStorage` & `singleWorker`:** These have been removed in favour of a simpler isolation model that more closely matches Vitest. Storage isolation is now on a per test file basis, and you can make your test files share the same storage by using the Vitest flags `--max-workers=1 --no-isolate`
- **`import { env, SELF } from "cloudflare:test"`:** These have been removed in favour of `import { env, exports } from "cloudflare:workers"`. `exports.default.fetch()` has the same behaviour as `SELF.fetch()`, except that it doesn't expose Assets. To test your assets, write an integration test using [`startDevWorker()`](https://developers.cloudflare.com/workers/testing/unstable_startworker/)
- **`import { fetchMock } from "cloudflare:test"`:** This has been removed. Instead, [mock `globalThis.fetch`](https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-pool-workers-examples/request-mocking/test/imperative.test.ts) or use ecosystem libraries like [MSW (recommended)](https://mswjs.io/).
