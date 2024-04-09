---
"wrangler": minor
---

fix: fix `pages function build-env` to exit with code rather than throw fatal error

Currently pages functions build-env throws a fatal error if a config file does not exit, or if it is invalid. This causes issues for the CI system. We should instead exit with a specific code, if any of those situations arises.
