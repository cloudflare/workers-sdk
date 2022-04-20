---
"wrangler": patch
---

fix: Error messaging from failed login would dump a `JSON.parse` error in some situations. Added a fallback if `.json` fails to parse
it will attempt `.text()` then throw result. If both attempts to parse fail it will throw an `UnknownError` with a message showing where
it originated.

resolves #539
