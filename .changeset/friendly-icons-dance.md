---
"wrangler": minor
---

Add framework selection prompt during autoconfig

When running autoconfig in interactive mode, users are now prompted to confirm or change the detected framework. This allows correcting misdetected frameworks or selecting a framework when none was detected, defaulting to "Static" in that case.
