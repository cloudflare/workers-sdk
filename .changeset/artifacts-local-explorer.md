---
"miniflare": minor
---

Manage local Artifacts repositories through the Local Explorer API

`cf --local` can now create, list, fork, import, and delete local Artifacts repositories, and create, list, and revoke repository tokens. The Local Explorer API implements these routes with the same request and response shapes as the Artifacts REST API.

Repositories share state with `wrangler dev` sessions using the same persistence directory, in either direction. With shared storage, as `cf --local` uses, the `default` namespace is always available; namespaces that already have local state are available without a Worker binding. A missing Git installation disables only these routes, which return `503`. A returned Git remote uses the namespace's recorded port, so clone and push while a dev server runs for that state directory. Changes made by `cf --local` do not publish repository events.
