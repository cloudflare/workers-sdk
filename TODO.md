## TODO

bash completion (and zsh?)
make the ui actually look nice
middleware to add the apiToken into the yargs args

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

commands

---

- [💀] DEPRECATE generate
- [ ] init
  - [ ] generate wrangler.toml
  - [ ] interactive flow
- [💀] DEPRECATE build
  - [ ] Q: what if folks want to see the generated script? For debugging or whatever.
- [~] login
  - [~] login
  - [~] refresh
  - [~] logout
  - [~] transparent refresh across commands
- [~] logout (same as login.logout)
- [💀] DEPRECATE config?
- [~] publish
  - [ ] how does this tie to new environments work?
- [~] dev
  - [ ] seamless refresh (pause and resume incoming requests when rebuilding)
  - [ ] sourcemaps
- [ ] tail
  - [ ] interactive (so you don't have to install the whole project just to tail)
- [💀] DEPRECATE preview
- [~] route
  - [~] list
  - [~] delete
  - [ ] interactive
- [💀] DEPRECATE subdomain
  - [ ] describe alternatives (redirect to dashboard?)
- [ ] secret put/delete/list
  - [ ] interactive?
- [ ] sites
- [ ] kv
  - [~] kv:namespace
  - [~] kv:key
  - [ ] kv:bulk
  - [ ] (all the commands)
  - [ ] interactive
- [ ] whoami
- [ ] durable objects

## config

- to deprecate

  - [ ] build? needs to be redone, really
  - [ ] webpack_config

- setup publish to npm
- base acceptance with all commands
- feature complete on all commands
- production ready on all commands
- deprecations
