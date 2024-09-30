# How to register a binding

1. Register wrangler.toml section in: `packages/wrangler/src/config/environment.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/config/environment.ts#L431-L451)
1. Register validation functions in: `packages/wrangler/src/config/validation.ts` [ref-1](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/config/validation.ts#L1297-L1306)
1. Add empty state for binding everywhere typescript tells you (use your editor to find errors, or run: `pnpm check:type` from within `packages/wrangler`)
1. Add type for deployment bundle to:
   - `CfWorkerInit` in: `packages/wrangler/src/deployment-bundle/worker.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/deployment-bundle/worker.ts#L79C1-L85C2)
   - `WorkerMetadataBinding` in: `packages/wrangler/src/deployment-bundle/create-worker-upload-form.ts` [ref-1](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/deployment-bundle/create-worker-upload-form.ts#L65) [ref-2](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/deployment-bundle/create-worker-upload-form.ts#L219-L225)
1. Add user-friendly output for printBindings in: `packages/wrangler/src/config/index.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/config/index.ts#L270-L280)
1. Add mapping functions to:
   - `createWorkerUploadForm` in: `packages/wrangler/src/deployment-bundle/create-worker-upload-form.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/deployment-bundle/create-worker-upload-form.ts#L219-L225)
   - `convertCfWorkerInitBindingstoBindings` in: `packages/wrangler/src/api/startDevWorker/utils.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/api/startDevWorker/utils.ts#L118-L123)
   - `convertBindingsToCfWorkerInitBindings` in: `packages/wrangler/src/api/startDevWorker/utils.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/api/startDevWorker/utils.ts#L303-L305)
1. Test binding is deployed + printed in: `packages/wrangler/src/**tests**/deploy.test.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/__tests__/deploy.test.ts#L7604)
1. Test your validation in: `packages/wrangler/src/**tests**/configuration.test.ts` [ref](https://github.com/cloudflare/workers-sdk/blob/ce7db9d9cb4f5bcd5a326b86dde051cb54b999fb/packages/wrangler/src/__tests__/configuration.test.ts#L2234)
