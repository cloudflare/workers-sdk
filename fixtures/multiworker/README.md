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

- build Wrangler: `pnpm turbo build -F wrangler`
- run this fixture `pnpm turbo dev -F multiworker`
