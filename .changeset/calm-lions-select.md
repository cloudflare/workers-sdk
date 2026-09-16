---
"miniflare": minor
---

Support named images or no default image for Durable Object-managed Containers

Miniflare now accepts named image references for Durable Object-managed Containers and preserves an omitted default image (`imageName`). A Container without a default image must supply an image or full Container snapshot when starting.

This extends Miniflare's experimental Durable Object-managed Containers interface.
