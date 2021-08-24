## workers-run

Trying to implement [this](https://wiki.cfops.it/pages/viewpage.action?pageId=363504565) tl;dr - the core experience of `wrangler dev`, in javascript
This takes ashcon's work from https://bitbucket.cfdata.org/users/ashcon/repos/workers-run/browse (thanks ashcon!)

## TODO

fix the websocket timeout
make the ui actually look nice
implement useTunnel

- [-] `--inspect` should open up a chrome dev tools instance automatically? what about vscode? or anything else with a debugger?
- [x] a reverse proxy to get a localhost endpoint
  - [ ] proxy websockets as well (verify with durable objects)
- [x] module resolution should just work. the idea here is to use esbuild behind the scenes to generate the script, but never expose the esbuild api.
- [ ] for 'plugins' expose something like node's experimental loader?
- [x] watch mode?
  - [ ] block requests while the new token etc are being generated
  - [ ] should watch mode be off by default?
- [x] request logs
- [ ] custom port number
- [ ] restart when session expires
- [ ] login

  - [ ] read creds from somewhere
  - [ ] if not logged in, automatically open a browser and ask to login, and save creds somewhere

- [ ] my assumption is folks will use Pages (or something else?) for static assets; regardless, for local work there may be a need to serve it off the same localhost point. also figure out what the dev experience more widely would be.
- [ ] sure would be nice to have typescript types for everything (including anything fancy that we add on to requests/responses)
- [ ] `--local` mode should use miniflare?

- [ ] have to be very careful when using types here. typescript assumes this is a browser environment, and I haven't figured out how to disable that.
  - should use types specific to our cloudflare environment, kv and all
- [ ] fix the todo/typecheck failure in preview.ts (search for ts-expect-error)
- [ ] use something like ncc/pkg to consume dependencies into a single bundle (except binaries like esbuild, ofc)
- [ ] what's the rust/wasm story?
- [ ] when running, maybe have keyboard shortcuts?
  - [x] B to open a browser.
  - [ ] I to open inspector
  - [x] S to share / tunnel
  - [ ] L to toggle local mode
- [ ] warn on node polyfills
- [ ] warn on bundle size
- [ ] automatically get zone id stuff?
- [ ] eslint? specifically to make sure exports are right, etc
- [ ] I think we want to default to modules, but should be able to try service-workers syntax
- [ ] uh, live reload?
- [ ] don't crash on esbuild error
- [ ] shut down inspector server on rebuild
- [ ] when a worker starts up, it has to do 4 requests(!) in a row just to get the preview token and prewarm. Would be nice if this was a single call (and faster)
- [ ] testssss
- [ ] why aren't regular console.logs showing colors for numbers, etc?
- [ ] model async work with `<Suspense>`
