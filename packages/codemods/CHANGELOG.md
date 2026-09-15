# @cloudflare/codemods

## 0.1.0

### Minor Changes

- [#14690](https://github.com/cloudflare/workers-sdk/pull/14690) [`d81fae7`](https://github.com/cloudflare/workers-sdk/commit/d81fae7487abee539d985c348dddf39bca3196f7) Thanks [@penalosa](https://github.com/penalosa)! - Add a central CLI for Cloudflare codemods

  Run a codemod by name, e.g. `npx @cloudflare/codemods vitest:v3-to-v4`. The initial migrations cover Vitest v3 to v4 configuration (`vitest:v3-to-v4`) and the `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` v1 rename (`vitest:pool-workers-to-vitest-plugin`). The existing Vitest transform now lives in this dedicated package.
