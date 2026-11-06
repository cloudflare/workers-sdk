---
"@cloudflare/containers-shared": minor
---

Remove the image-tag Container cleanup helpers

`cleanupContainers()`, `getContainerIdsByImageTags()`, and `getContainerIdsFromImage()` are removed. They found local containers by image tag, which missed the networking sidecars and snapshot clone volumes that workerd creates. Miniflare now removes those resources itself.
