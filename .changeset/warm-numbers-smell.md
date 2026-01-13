---
"miniflare": patch
---

Minimize the number of the package dependencies

In order to prevent possible npm vulnerability attacks the team's policy is to bundle as much as possible dependencies in our packages, this helps ensuring that only trusted code will be run in the user's system even if new compromised packages are released on npm. So the changes here reduce the number of dependencies of the package to the bare minimum (and the dependencies that are not bundled are pinned to a specific version, also removing the potential npm attack vulnerability).
