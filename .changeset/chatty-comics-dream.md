---
"wrangler": patch
---

Add minimum and maximum version checks for frameworks during auto-configuration

When Wrangler automatically configures a project, it now validates the installed version of the detected framework before proceeding:

- If the version is below the minimum known-good version, the command exits with an error asking the user to upgrade the framework.
- If the version is above the maximum known major version, a warning is emitted to let the user know the framework version has not been officially tested with this feature, and the command continues.
