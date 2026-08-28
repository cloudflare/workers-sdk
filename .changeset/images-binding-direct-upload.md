---
"miniflare": minor
---

Support `env.IMAGES.hosted.createDirectUpload()` in local development. Creates a draft image and returns an `uploadURL` served by a new local endpoint that accepts the completed upload as `multipart/form-data` (field name `file`). Matches production's validation (`expiresIn` bounds of 120–21600 seconds, rejecting UUID custom IDs) and single-use/expiry semantics: completing an unknown or already-used upload link returns 404/409, and an expired link returns 410.
