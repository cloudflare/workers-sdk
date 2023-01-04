# Template: Direct Creator Uploads to Cloudflare Stream

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/stream/upload/direct-creator-uploads)

Example of (Direct Creator Uploads)[https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/] to Cloudflare Stream

### Setup

1. Create a new file named `.dev.vars` in this directory, and add the following:

```
CLOUDFLARE_ACCOUNT_ID = ""
CLOUDFLARE_API_TOKEN = ""
```

1. Edit the values for `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.dev.vars`. Your Cloudflare API Token should never be committed to git or exposed in client avascript.
2. Run `npm run dev`
