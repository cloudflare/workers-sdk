---
"wrangler": patch
---

fix: ensure upstream_protocol is passed to the Worker

In `wrangler dev` it is possible to set the `upstream_protocol`,
which is the protocol under which the User Worker believes it has been
requested, as recorded in the `request.url` that can be used for
forwarding on requests to the origin.

Previously, it was not being passed to `wrangler dev` in local mode.
Instead it was always set to `http`.

Note that setting `upstream_protocol` to `http` is not supported in
`wrangler dev` remote mode, which is the case since Wrangler v2.0.

This setting now defaults to `https` in remote mode (since that is the only option),
and to the same as `local_protocol` in local mode.

Fixes #4539
