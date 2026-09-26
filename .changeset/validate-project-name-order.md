---
"create-cloudflare": patch
---

Validate project name format before checking for directory conflicts

Previously, when providing an invalid project name for an existing directory containing files, C3 reported that the directory already exists and contains conflicting files instead of reporting the invalid project name. Project name format validation is now performed before checking whether the directory already exists.
