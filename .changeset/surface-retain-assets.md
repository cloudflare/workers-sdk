---
"wrangler": minor
---

Add `assets.retention` configuration option

You can now enable asset retention for your Worker to prevent "version skew" breakage for SPAs and static sites. When enabled, assets from recently deployed versions (up to the last 24 hours) remain reachable, so that an old browser tab requesting a content-hashed asset that no longer exists in the latest version can still be served.

Enabling is immediately retroactive: previously deployed assets -- including paths deleted in that period -- become reachable again from the moment retention is switched on, not from the next deploy.

```jsonc
// wrangler.json
{
	"assets": {
		"directory": "./public",
		"retention": { "enabled": true },
	},
}
```
