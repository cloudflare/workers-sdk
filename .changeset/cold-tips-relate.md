---
"wrangler": patch
---

Reduce the amount of arguments being passed in metrics capture.

Now the argument values that are captured come from an allow list,
and can be marked as ALLOW (capture the real value) or REDACT (capture as "<REDACTED>").
