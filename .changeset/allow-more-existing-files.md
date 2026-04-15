---
"create-cloudflare": patch
---

Allow `.gitkeep`, `.venv`, `Makefile`, and `.yarn` in the current working directory when running `create cloudflare .`

Previously, having a `Makefile` or `.venv` in the current directory would cause C3 to error when trying to scaffold a project into the current directory. These common files are now allowed, matching the behavior of other tools like `git init`.
