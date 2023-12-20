---
"wrangler": patch
---

fix: prevent zombie `workerd` processes

Previously, running `wrangler dev` would leave behind "zombie" `workerd` processes. These processes prevented the same port being bound if `wrangler dev` was restarted and sometimes consumed lots of CPU time. This change ensures all `workerd` processes are killed when `wrangler dev` is shutdown.

To clean-up existing zombie processes, run `pkill -KILL workerd` on macOS/Linux or `taskkill /f /im workerd.exe` on Windows.
