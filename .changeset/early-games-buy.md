---
"wrangler": patch
---

Subfolder Relative Pathing Fix issue #147
The filename from args didn't handle relative paths passed in from users with scripts in subfolders.
To handle the subfolder pathing a path.relative using cwd() to user input filepath to the filepath variable passed into Dev
