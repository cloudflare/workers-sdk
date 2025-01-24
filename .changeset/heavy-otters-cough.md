---
"create-cloudflare": patch
---

fix: Use today's date for compat date when the latest workerd release date is in the future

Fixes an issue where deployments would fail when there is a workerd release on the same day due to workerd releases having a date in the future because Workers does not allow using a compat date in the future.
