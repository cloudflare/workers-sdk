---
"wrangler": minor
---

Enable automatic resource provisioning by default in Wrangler. This is still an experimental feature, but we're turning on the flag by default to make it easier for people to test it and try it out. You can disable the feature using the `--no-x-provision` flag. It currently works for R2, D1, and KV bindings.

To use this feature, add a binding to your config file _without_ a resource ID:

```jsonc
{
    "kv_namespaces": [{ "binding": "MY_KV" }],
    "d1_databases": [{ "binding": "MY_DB" }],
    "r2_buckets": [{ "binding": "MY_R2" }]
}
```

`wrangler dev` will automatically create these resources for you locally, and when you next run `wrangler deploy` Wrangler will call the Cloudflare API to create the requested resources and link them to your Worker. They'll stay linked across deploys, and you don't need to add the resource IDs to the config file for future deploys to work. This is especially good for shared templates, which now no longer need to include account-specific resource ID when adding a binding.
