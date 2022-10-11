# pages-workerjs-and-functions-app

## 0.0.1

### Patch Changes

- [#1950](https://github.com/cloudflare/wrangler2/pull/1950) [`daf73fbe`](https://github.com/cloudflare/wrangler2/commit/daf73fbe03b55631383cdc86a05eac12d2775875) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - `wrangler pages dev` should prioritize `_worker.js`

  When using a `_worker.js` file, the entire `/functions` directory should be ignored – this includes its routing and middleware characteristics. Currently `wrangler pages dev` does the reverse, by prioritizing
  `/functions` over `_worker.js`. These changes fix the current behaviour.
