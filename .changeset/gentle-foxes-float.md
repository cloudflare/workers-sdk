---
"wrangler": patch
---

fix: avoid `getPlatformProxy` logging twice that it is using vars defined in `.dev.vars` files

when `getPlatformProxy` is called and it retrieves values from `.dev.vars` files, it logs twice
a message like: `Using vars defined in .dev.vars`, the changes here make sure that in such cases
this log only appears once
