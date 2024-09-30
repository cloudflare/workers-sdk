# How to register a binding

1. register wrangler.toml section in: packages/wrangler/src/config/environment.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-c024f5de2a1dafa359fc46af77eef571b76b1fd11c800a202009daa7829bc8c4R757-R773)
1. register validation functions in: packages/wrangler/src/config/validation.ts [ref-1](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-0ec779a40744e36b45a9b28dee06739afa8aa2f00bb9388b68556e7fd87ab99eR1447-R1456) [ref-2](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-0ec779a40744e36b45a9b28dee06739afa8aa2f00bb9388b68556e7fd87ab99eR3117-R3149)
1. add empty state for binding everywhere typescript tells you
1. add type for deployment bundle to:
   - CfWorkerInit in: packages/wrangler/src/deployment-bundle/worker.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-8506c95c57e660444d7817667859954028b3f5089896ecfe29bd2fb6d1f215beR229-R233)
   - WorkerMetadataBinding in: packages/wrangler/src/deployment-bundle/create-worker-upload-form.ts [ref-1](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-f5add872789053bab9670e1b80475de151c770dff0f7018793818c4d92b81038R113) [ref-2](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-f5add872789053bab9670e1b80475de151c770dff0f7018793818c4d92b81038R320-R327)
1. add user-friendly output for printBindings in: packages/wrangler/src/config/index.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-80a0404f59f781e58a6e6892e5457ca6bd1c7b7e5687155159bde57f6cc65452R447-R456)
1. add mapping functions to:
   - createWorkerUploadForm in: packages/wrangler/src/deployment-bundle/create-worker-upload-form.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-f5add872789053bab9670e1b80475de151c770dff0f7018793818c4d92b81038R320-R327)
   - convertCfWorkerInitBindingstoBindings in: packages/wrangler/src/api/startDevWorker/utils.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-9c39e489b2145dc4a898e07dd679a30abb956239f4e70f9c4d2ed6075f5fb7f0R247-R252)
   - convertBindingsToCfWorkerInitBindings in: packages/wrangler/src/api/startDevWorker/utils.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-9c39e489b2145dc4a898e07dd679a30abb956239f4e70f9c4d2ed6075f5fb7f0R367-R369)
1. test binding is deployed + printed in: packages/wrangler/src/**tests**/deploy.test.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-81706a80fd0b3a4bce16ab020267448ff21ad04a71e22802937633c3080dffbfR10469-R10509)
1. test your validation in: packages/wrangler/src/**tests**/configuration.test.ts [ref](https://github.com/cloudflare/workers-sdk/pull/6651/files#diff-6bc0db7244bb7b5515bba8027b3a8dca71c2cdf4fd976b65b0d76cebc06ad896R3185-R3292)
