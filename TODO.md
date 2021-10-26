## TODO

bash completion (and zsh?)
make the ui actually look nice

- [ ] proxy websockets as well (verify with durable objects)
- [ ] for 'plugins' expose something like node's experimental loader?
- [ ] block requests while the new token etc are being generated
- [ ] custom port number
- [ ] restart when session expires
- [ ] what's the rust/wasm story?
- [ ] warn on node polyfills
- [ ] warn on bundle size
- [ ] automatically get zone id stuff?
- [ ] I think we want to default to modules, but should be able to try service-workers syntax
- [ ] don't crash on esbuild error
- [ ] shut down inspector server on rebuild
- [ ] when a worker starts up, it has to do 4 requests(!) in a row just to get the preview token and prewarm. Would be nice if this was a single call (and faster)
- [ ] testssss
- [ ] error reporting (ala https://github.com/cloudflare/wrangler/blob/master/src/reporter/mod.rs)

- [ ] publish to npm as a canary on every commit
- [ ] integrate with changesets?
- [ ] fix zoned publish
- [ ] dropdown when multiple account ids
- [ ] literally any tests
- [ ] config: compat dates, usage_model
- [ ] the remaining `dev` flags

big remaining features

- [ ] sites
- [ ] tail
- [ ] durable objects / websockets
- [ ] secrets
