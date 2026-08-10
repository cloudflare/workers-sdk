---
"miniflare": minor
---

Add `convertV4MiniflareOptions` for migrating Miniflare v4 options

You can now convert v4-shaped Miniflare options to the config-based `workers` shape before creating or updating a Miniflare instance. Some v4 options cannot be converted without losing behavior and will throw an error instead.
