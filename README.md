## workers-run

Trying to implement [this](https://wiki.cfops.it/pages/viewpage.action?pageId=363504565) tl;dr - the core experience of `wrangler dev`, in javascript
This takes ashcon's work from https://bitbucket.cfdata.org/users/ashcon/repos/workers-run/browse (thanks ashcon!)

## TODO

- login
  - read creds from somewhere
  - if not logged in, automatically open a browser and ask to login, and save creds somewhere
- `--inspect` should open up a chrome dev tools instance automatically? what about vscode? or anything else with a debugger?
- a reverse proxy to get a localhost endpoint, websockets and all
- my assumption is folks will use Pages (or something else?) for static assets; regardless, for local work there may be a need to serve it off the same localhost point. also figure out what the dev experience more widely would be.
- sure would be nice to have typescript types for everything (inclu anything fancy that we add on to requests/responses)
- --local mode should use miniflare?
- module resolution should just work. the idea here is to use esbuild behind the scenes to generate the script, but never expose the esbuild api.
- for 'plugins' expose something like node's experimental loader?
- have to be very careful when using types here. typescript assumes this is a browser environment, and I haven't figured out how to disable that.
- fix the todo/typecheck failure in preview.ts (search for ts-expect-error)
- use something like ncc to consume dependencies into a single bundle (except binaries like esbuild, ofc)
- what's the rust/wasm story?
