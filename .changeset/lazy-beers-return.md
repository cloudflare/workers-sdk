---
"wrangler": minor
---

R2 Jurisdictional Restrictions guarantee objects in a bucket are stored within a specific jurisdiction. Wrangler now allows you to interact with buckets in a defined jurisdiction.

Wrangler R2 operations now support a `-J` flag that allows the user to specify a jurisdiction. When passing the `-J` flag, you will only be able to interact with R2 resources within that jurisdiction.

```bash
# List all of the buckets in the EU jurisdiction
wrangler r2 bucket list -J eu
# Downloads the object 'myfile.txt' from the bucket 'mybucket' in EU jurisdiction
wrangler r2 object get mybucket/myfile.txt -J eu
```

To access R2 buckets that belong to a jurisdiction from Workers, you will need to specify the jurisdiction as well as the bucket name as part of your bindings in your `wrangler.toml`:

```toml
[[r2_buckets]]
bindings = [
  { binding = "MY_BUCKET", bucket_name = "<YOUR_BUCKET_NAME>", jurisdiction = "<JURISDICTION>" }
]
```
