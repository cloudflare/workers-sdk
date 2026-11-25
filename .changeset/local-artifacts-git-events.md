---
"miniflare": minor
---

Publish local Artifacts push, clone, and fetch events

Local Artifacts namespaces now publish `cf.artifacts.repo.pushed`, `cf.artifacts.repo.cloned`, and `cf.artifacts.repo.fetched` when Git pushes to, clones, or fetches from a repository, so Workflows subscribed to them start during local development. Previously these subscriptions were accepted but never fired. As in production, a push publishes one event for each ref it changes, and a branch update lists up to 20 of the commits it added.
