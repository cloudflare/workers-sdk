## TODO

- [ ] bash completion (and zsh?)
- [ ] proxy websockets as well (verify with durable objects)
- [ ] for 'plugins' expose something like node's experimental loader?
- [ ] block requests while the new token etc are being generated
- [ ] restart when session expires
- [ ] what's the rust/wasm story?
- [ ] `--polyfill-node`
- [ ] warn on bundle size
- [ ] don't crash on esbuild error
- [ ] shut down inspector server on rebuild
- [ ] when a worker starts up, it has to do 4 requests(!) in a row just to get the preview token and prewarm. Would be nice if this was a single call (and faster)
- [ ] testssss
- [ ] error reporting (ala https://github.com/cloudflare/wrangler/blob/master/src/reporter/mod.rs)

- [ ] integrate with changesets?
- [ ] add a dns record when you publish to a zoned subdomain that doesn't exist yet
- [ ] dropdown when multiple account ids
- [ ] literally any tests
- [ ] config: compat dates, usage_model
- [ ] the remaining `dev` flags

- [ ] instead of bundling the facade with the worker, we should just bundle the worker and expose it as a module.

big remaining features

- [ ] tail
- [ ] durable objects / websockets

## new features

- pass in cli
  - file name
  - site
  - public
    - which automatically serves assets
  - tail <zone>\*
  - dev <...>
  - publish <...>
- infer
  - account id
  - zone id
  - module format (!!!)
- local mode for everything (dev, kv, do\*)
- inbuilt devtools
- modules, jsx, ts; ootb
- auto login
- share dev url

more features

- auto publish every commit to npm
- it's allll typescript
- react/ink
