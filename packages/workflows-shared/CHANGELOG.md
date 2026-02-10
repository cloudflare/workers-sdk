# @cloudflare/workflows-shared

## 0.4.0

### Minor Changes

- [#11648](https://github.com/cloudflare/workers-sdk/pull/11648) [`eac5cf7`](https://github.com/cloudflare/workers-sdk/commit/eac5cf74db6d1b0865f5dc3a744ff28e695d53ca) Thanks [@pombosilva](https://github.com/pombosilva)! - Add Workflows test handlers in vitest-pool-workers to get the Workflow instance output and error:

  - `getOutput()`: Returns the output of the successfully completed Workflow instance.
  - `getError()`: Returns the error information of the errored Workflow instance.

  Example:

  ```ts
  // First wait for the workflow instance to complete:
  await expect(
  	instance.waitForStatus({ status: "complete" })
  ).resolves.not.toThrow();

  // Then, get its output
  const output = await instance.getOutput();

  // Or for errored workflow instances, get their error:
  await expect(
  	instance.waitForStatus({ status: "errored" })
  ).resolves.not.toThrow();
  const error = await instance.getError();
  ```

## 0.3.9

### Patch Changes

- [#11448](https://github.com/cloudflare/workers-sdk/pull/11448) [`2b4813b`](https://github.com/cloudflare/workers-sdk/commit/2b4813b18076817bb739491246313c32b403651f) Thanks [@edmundhung](https://github.com/edmundhung)! - Builds package with esbuild `v0.27.0`

## 0.3.8

### Patch Changes

- [#10919](https://github.com/cloudflare/workers-sdk/pull/10919) [`ca6c010`](https://github.com/cloudflare/workers-sdk/commit/ca6c01017ccc39671e8724a6b9a5aa37a5e07e57) Thanks [@Caio-Nogueira](https://github.com/Caio-Nogueira)! - migrate workflow to use a wrapped binding

## 0.3.7

### Patch Changes

- [#10813](https://github.com/cloudflare/workers-sdk/pull/10813) [`545afe5`](https://github.com/cloudflare/workers-sdk/commit/545afe504ab6c3c44373fc47d58a2641aadb0d2d) Thanks [@pombosilva](https://github.com/pombosilva)! - Workflows are now created if the Request gets redirected after creation

## 0.3.6

### Patch Changes

- [#10785](https://github.com/cloudflare/workers-sdk/pull/10785) [`d09cab3`](https://github.com/cloudflare/workers-sdk/commit/d09cab3b86149a67c471401daa64ff631cfb4e49) Thanks [@pombosilva](https://github.com/pombosilva)! - Workflows names and instance IDs are now properly validated with production limits.

## 0.3.5

### Patch Changes

- [#10219](https://github.com/cloudflare/workers-sdk/pull/10219) [`28494f4`](https://github.com/cloudflare/workers-sdk/commit/28494f413bba3c509c56762b9260edd0ffef4f28) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix `NonRetryableError` thrown with an empty error message not stopping workflow retries locally

## 0.3.4

### Patch Changes

- [#9367](https://github.com/cloudflare/workers-sdk/pull/9367) [`2e12e6e`](https://github.com/cloudflare/workers-sdk/commit/2e12e6e6f37d35805fcf6b0f8916cb4136543837) Thanks [@Caio-Nogueira](https://github.com/Caio-Nogueira)! - Fix instance hydration after abort. Some use cases were causing instances to not be properly rehydrated after server shutdown, which would cause the instance to be lost.

## 0.3.3

### Patch Changes

- [#9033](https://github.com/cloudflare/workers-sdk/pull/9033) [`2c50115`](https://github.com/cloudflare/workers-sdk/commit/2c501151d3d1a563681cdb300a298b83862b60e2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: convert wrangler.toml files into wrangler.jsonc ones

## 0.3.2

### Patch Changes

- [#8775](https://github.com/cloudflare/workers-sdk/pull/8775) [`ec7e621`](https://github.com/cloudflare/workers-sdk/commit/ec7e6212199272f9811a30a84922823c82d7d650) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Add `waitForEvent` and `sendEvent` support for local dev

## 0.3.1

### Patch Changes

- [#8606](https://github.com/cloudflare/workers-sdk/pull/8606) [`18edbc2`](https://github.com/cloudflare/workers-sdk/commit/18edbc2a6b02e6b7cd0a027e5b90ff043da6ee79) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Implement local dev for createBatch

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
