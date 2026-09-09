---
"miniflare": patch
---

Fix the local Images binding and `cf.image` transforms ignoring EXIF orientation. Previously, photos stored with an EXIF orientation flag (e.g. phone portrait photos, stored as landscape pixels plus a rotation flag) came back sideways from local transforms, while the production Images binding auto-orients them. Local dev now bakes the EXIF rotation into the pixels before applying transforms, matching production behavior.
