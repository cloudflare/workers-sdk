# Automatic Multi-worker Demo

`wrangler dev` has been augmented to be able to automatically load up multiple Workers
that are service bound together using paths to the Wrangler config rather than Worker name.

For example in `worker-a/wrangler.toml` we have:

```toml
[[services]]
binding = "workerB"
service = "../worker-b/wrangler.toml"
```

When Wrangler sees the path rather than the name it will recursively load that config as an auxiliary Worker.

## Give it a go

- build Wrangler (from the root of the workers-sdk repo): `pnpm build -F wrangler`
- change directory to this fixture: `cd fixtures/multiworker`
- run the Workers locally `pnpm run dev` or `pnpm wrangler dev -c worker-a/wrangler.toml`
- deploy the Workers `pnpm run deploy` or `pnpm wrangler deploy -c worker-a/wrangler.toml`
