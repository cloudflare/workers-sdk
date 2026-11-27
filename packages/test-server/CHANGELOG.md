# @cloudflare/test-server

## 0.1.0

### Minor Changes

- [#16798](https://github.com/cloudflare/workers-sdk/pull/16798) [`4b10c0f`](https://github.com/cloudflare/workers-sdk/commit/4b10c0f5a1d390095bac55c028f7df1929854747) Thanks [@edmundhung](https://github.com/edmundhung)! - Add `@cloudflare/test-server` for testing a project's production build

  Like Wrangler's `createTestHarness()`, `createTestServer()` runs your Workers in tests, but from the Build Output that `cf build` writes, so your tests exercise what you deploy. Remote bindings use the same credentials as cf.

  ```ts
  const server = createTestServer({ workers: [{ projectDir: "./" }] });
  await server.listen();
  const response = await server.fetch("/");
  ```

  This package is experimental and its API may change in minor versions.

### Patch Changes

- [#17220](https://github.com/cloudflare/workers-sdk/pull/17220) [`b89dfcf`](https://github.com/cloudflare/workers-sdk/commit/b89dfcf23a473860649138dd5641141d7569cca6) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-27

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

- Updated dependencies [[`07d2051`](https://github.com/cloudflare/workers-sdk/commit/07d205105ff2667cbfe3babd52aa0ae38187cf80), [`b645124`](https://github.com/cloudflare/workers-sdk/commit/b6451243417e541f61f239c6275b20c59927b497), [`8d3e953`](https://github.com/cloudflare/workers-sdk/commit/8d3e9538d67c46cab48201c97e2fcdff7edf451f), [`b89dfcf`](https://github.com/cloudflare/workers-sdk/commit/b89dfcf23a473860649138dd5641141d7569cca6), [`b645124`](https://github.com/cloudflare/workers-sdk/commit/b6451243417e541f61f239c6275b20c59927b497), [`8d3e953`](https://github.com/cloudflare/workers-sdk/commit/8d3e9538d67c46cab48201c97e2fcdff7edf451f), [`b89dfcf`](https://github.com/cloudflare/workers-sdk/commit/b89dfcf23a473860649138dd5641141d7569cca6), [`b645124`](https://github.com/cloudflare/workers-sdk/commit/b6451243417e541f61f239c6275b20c59927b497), [`927f070`](https://github.com/cloudflare/workers-sdk/commit/927f070ee0589a2567a76f2000dcff60b1b3d2eb), [`43da328`](https://github.com/cloudflare/workers-sdk/commit/43da3289c5f715c03143d31fde6dc46b4d90b28b), [`e46c7c6`](https://github.com/cloudflare/workers-sdk/commit/e46c7c6a4c9c797f5d8f40827c9f2e4ef8e3fd6c)]:
  - miniflare@5.20261127.0-beta
  - @cloudflare/build-output-utils@1.0.0-rc.5
  - @cloudflare/config@1.0.0-rc.5
