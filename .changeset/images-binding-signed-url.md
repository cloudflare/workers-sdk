---
"miniflare": minor
---

Support `env.IMAGES.hosted.image(id).signedUrl()` in local development. A fixed local-dev signing secret is used to generate and verify signed delivery URLs, so images uploaded with `requireSignedURLs: true` can only be fetched from the local image delivery endpoint with a valid, unexpired signature — matching the production Images binding's signed URL behaviour end-to-end.
