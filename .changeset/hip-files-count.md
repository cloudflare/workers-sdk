---
"wrangler": minor
---

fix: Do not show unnecessary errors during watch rebuilds

When Pages is used in conjunction with a full stack framework, the framework
build will temporarily remove files that are being watched by Pages, such as
_worker.js and _routes.json.
Previously we would display errors for these changes, which adds confusing and excessive messages to the Pages dev output. Now builds are skipped if a watched _worker.js or _routes.json is removed.
