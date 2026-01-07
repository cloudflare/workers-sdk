---
"create-cloudflare": patch
---

Update Waku framework template wrangler.jsonc main entry path

Waku changed the worker main entry build path for v1.0. https://github.com/wakujs/waku/pull/1758

Removed not_found_handling so the worker will be invoked when no asset is found. This avoids 404 errors Waku server-side routes when assets_navigation_prefers_asset_serving is enabled. https://developers.cloudflare.com/workers/configuration/compatibility-flags/#navigation-requests-prefer-asset-serving
