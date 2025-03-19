# @cloudflare/workflows-shared

## 0.3.0

### Minor Changes

- [#7334](https://github.com/cloudflare/workers-sdk/pull/7334) [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f) Thanks [@penalosa](https://github.com/penalosa)! - Packages in Workers SDK now support the versions of Node that Node itself supports (Current, Active, Maintenance). Currently, that includes Node v18, v20, and v22.

## 0.2.3

### Patch Changes

- [#8123](https://github.com/cloudflare/workers-sdk/pull/8123) [`7f565c5`](https://github.com/cloudflare/workers-sdk/commit/7f565c5c8844cd8c42137ed653e0665fa54950d1) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Make NonRetryableError work and cache errored steps

## 0.2.2

### Patch Changes

- [#7575](https://github.com/cloudflare/workers-sdk/pull/7575) [`7216835`](https://github.com/cloudflare/workers-sdk/commit/7216835bf7489804905751c6b52e75a8945e7974) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Make `Instance.status()` return type the same as production

## 0.2.1

### Patch Changes

- [#7520](https://github.com/cloudflare/workers-sdk/pull/7520) [`805ad2b`](https://github.com/cloudflare/workers-sdk/commit/805ad2b3959210b0d838daf789f580f329e1d7dd) Thanks [@bruxodasilva](https://github.com/bruxodasilva)! - Fixed a bug in local development where fetching a Workflow instance by ID would return a Workflow status, even if that instance did not exist. This only impacted the `get()` method on the Worker bindings.

## 0.2.0

### Minor Changes

- [#7286](https://github.com/cloudflare/workers-sdk/pull/7286) [`563439b`](https://github.com/cloudflare/workers-sdk/commit/563439bd02c450921b28d721d36be5a70897690d) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Add proper engine persistance in .wrangler and fix multiple workflows in miniflare

## 0.1.2

### Patch Changes

- [#7225](https://github.com/cloudflare/workers-sdk/pull/7225) [`bb17205`](https://github.com/cloudflare/workers-sdk/commit/bb17205f1cc357cabc857ab5cad61b6a4f3b8b93) Thanks [@bruxodasilva](https://github.com/bruxodasilva)! - - Fix workflows binding to create a workflow without arguments
  - Fix workflows instance.id not working the same way in wrangler local dev as it does in production

## 0.1.1

### Patch Changes

- [#7045](https://github.com/cloudflare/workers-sdk/pull/7045) [`5ef6231`](https://github.com/cloudflare/workers-sdk/commit/5ef6231a5cefbaaef123e6e8ee899fb81fc69e3e) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Add preliminary support for Workflows in wrangler dev
