---
"miniflare": patch
---

fix: cleanup temporary directory after shutting down `workerd`

Previously on exit, Miniflare would attempt to remove its temporary directory
before shutting down `workerd`. This could lead to `EBUSY` errors on Windows.
This change ensures we shutdown `workerd` before removing the directory.
Since we can only clean up on a best effort basis when exiting, it also catches
any errors thrown when removing the directory, in case the runtime doesn't
shutdown fast enough.
