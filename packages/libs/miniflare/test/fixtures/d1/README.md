# D1 Worker Fixture

Used by `test/plugins/d1/index.spec.ts`. Rebuild `worker.dist.mjs` by running
the following in the `packages/miniflare` directory:

```shell
$ npx wrangler@3.2.0 publish --config test/fixtures/d1/wrangler.toml --dry-run --outdir dist
$ mv test/fixtures/d1/dist/worker.js test/fixtures/d1/worker.dist.mjs
```

`wrangler@3.2.0` isn't included as a dependency as it predates the moving of D1
out of Wrangler and into the runtime, which would have caused issues with
different versions of Miniflare being installed.
