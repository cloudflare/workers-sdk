# D1 Worker Fixture

Used by `test/plugins/d1/index.spec.ts`. Rebuild `worker.dist.mjs` by running
the following in the `packages/tre` directory:

```shell
$ npx wrangler publish --config test/fixtures/d1/wrangler.toml --dry-run --outdir dist
$ mv test/fixtures/d1/dist/d1-beta-facade.entry.js test/fixtures/d1/worker.dist.mjs
```

`wrangler` isn't included as a dependency as that would likely cause issues with
different versions of Miniflare being installed.
