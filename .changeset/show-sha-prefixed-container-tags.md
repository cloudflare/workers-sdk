---
"wrangler": patch
---

Show valid `sha256`-prefixed tags in Container image listings

Container image listings now distinguish valid OCI tags such as `sha256-release` from synthetic digest entries such as `sha256:<digest>`.
