## example-wasm-app

This is a sample wasm worker. It was created by creating a [`workers-rs`](https://github.com/cloudflare/workers-rs) project, running a build, removing unneeded artifacts, and copying the output folder here. You can run this worker with `npx wrangler dev worker/shim.js` (or from the `wrangler` package directory with `npm start -- dev ../example-wasm-app/worker/shim.js`).
