---
"wrangler": minor
---

chore: Deprecate usage of the deployment object on the unsafe metadata binding in favor of the new version_metadata binding.

If you're currently using the old binding, please move over to the new version_metadata binding by adding:

```toml
[version_metadata]
binding = "CF_VERSION_METADATA"
```

and updating your usage accordingly. You can find the docs for the new binding here: https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata
