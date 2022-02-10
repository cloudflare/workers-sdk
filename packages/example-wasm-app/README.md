## example-wasm-app

There are 3 workers in this package. They were created with a [`workers-rs`](https://github.com/cloudflare/workers-rs) project, running a build, removing unneeded artifacts, and copying the output folders.

The wasm file generated, `index_bg.wasm` is copied into `./worker`, and shared by the 3 workers.

- `./worker/module` contains a "modules" format worker and imports the wasm module as a regular ES module.
- `./worker/service-worker` contains a "service-worker" format worker and uses `wrangler.toml` to bind the wasm module as a global `MYWASM`.
- `./worker/service-worker-module` contains a "service-worker" format worker and imports the wasm module as a regular ES module.

They're otherwise identical.

You can run the module worker with `npx wrangler dev worker/module/index.js` (or from the `wrangler` package directory with `npm start -- dev ../example-wasm-app/worker/module/index.js`).

You can run the service-worker worker with `npx wrangler dev worker/service-worker/index.js --config worker/service-worker/wrangler.toml` (or from the `wrangler` package directory with `npm start -- dev ../example-wasm-app/worker/service-worker/index.js --config ../example-wasm-app/worker/service-worker/wrangler.toml`).

You can run the service-worker-module worker with `npx wrangler dev worker/service-worker-module/index.js` (or from the `wrangler` package directory with `npm start -- dev ../example-wasm-app/worker/service-worker-module/index.js`).
