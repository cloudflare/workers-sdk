## workers-run

Trying to implement [this](https://wiki.cfops.it/pages/viewpage.action?pageId=363504565) tl;dr - the core experience of `wrangler dev`, in javascript
This takes ashcon's work from https://bitbucket.cfdata.org/users/ashcon/repos/workers-run/browse (thanks ashcon!)

## TODO

- have to be very careful when using types here. typescript assumes this is a browser environment, and I haven't figured out how to disable that.
- fix the todo/typecheck failure in preview.ts (search for ts-expect-error)
