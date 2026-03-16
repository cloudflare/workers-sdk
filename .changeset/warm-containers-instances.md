---
"wrangler": minor
"@cloudflare/containers-shared": minor
---

Add `wrangler containers instances <application_id>` command to list container instances

Lists all container instances for a given application, matching the Dash instances view. Displays instance ID, state, location, version, and creation time. Supports pagination for applications with many instances. Also adds paginated request support to the containers-shared API client.
