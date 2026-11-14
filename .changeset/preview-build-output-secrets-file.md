---
"@cloudflare/deploy-helpers": minor
---

Accept a secrets file when uploading a Preview from Build Output

`previewBuildOutput()` now takes the same `secretsFile` option as `preview()`. The file's secrets are uploaded with the Preview deployment, so a CLI that deploys Previews from Build Output can set Preview secrets without a separate command or the Cloudflare dashboard.
