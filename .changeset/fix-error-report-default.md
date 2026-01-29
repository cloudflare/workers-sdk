---
"wrangler": patch
---

Default error report prompt to "no" when pressing Enter

Previously, the error report prompt ("Would you like to report this error to Cloudflare?") defaulted to "yes" when pressing Enter. This caused users to accidentally submit error reports without explicitly consenting. The prompt now defaults to "no", requiring users to explicitly type "y" or "yes" to consent to submitting reports.
