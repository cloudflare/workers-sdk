---
"@cloudflare/workers-shared": minor
---

Requests with a `Sec-Fetch-Mode: navigate` header, made to a project with `sec_fetch_mode_navigate_header_prefers_asset_serving` compatibility flag, will be routed to the asset-worker rather than a user Worker when no exact asset match is found.

Requests without that header will continue to be routed to the user Worker when no exact asset match is found.
