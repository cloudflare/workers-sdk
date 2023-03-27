---
"wrangler": patch
---

Fix: Pages Dev incorrectly allowing people to turn off local mode

Local mode is not currently supported in Pages Dev, and errors when people attempt to use it. Previously, wrangler hid the "toggle local mode" button when using Pages dev, but this got broken somewhere along the line.
