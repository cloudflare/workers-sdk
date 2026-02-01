---
"wrangler": minor
---

Add `wrangler r2 bucket local-uploads` command to manage local uploads for R2 buckets

When enabled, object data is written to the nearest region first, then asynchronously replicated to the bucket's primary region.

Docs: https://developers.cloudflare.com/r2/buckets/local-uploads

```bash
# Get local uploads status
wrangler r2 bucket local-uploads get my-bucket

# Enable local uploads (will prompt for confirmation)
wrangler r2 bucket local-uploads enable my-bucket

# Enable without confirmation prompt
wrangler r2 bucket local-uploads enable my-bucket --force

# Disable local uploads
wrangler r2 bucket local-uploads disable my-bucket
```
