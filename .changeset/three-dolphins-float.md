---
"wrangler": minor
---

add support for service bindings in `wrangler pages dev` by providing the
new `--service`|`-s` flag which accepts an array of `BINDING_NAME=SCRIPT_NAME`
where `BINDING_NAME` is the name of the binding and `SCRIPT_NAME` is the name
of the worker (as defined in its `wrangler.toml`), such workers need to be
running locally with with `wrangler dev`.

For example if a user has a worker named `worker-a`, in order to locally bind
to that they'll need to open two different terminals, in each navigate to the
respective worker/pages application and then run respectively `wrangler dev` and
`wrangler pages ./publicDir --service MY_SERVICE=worker-a` this will add the
`MY_SERVICE` binding to pages' worker `env` object.

Note: additionally after the `SCRIPT_NAME` the name of an environment can be specified,
prefixed by an `@` (as in: `MY_SERVICE=SCRIPT_NAME@PRODUCTION`), this behavior is however
experimental and not fully properly defined.
