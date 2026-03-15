---
"wrangler": patch
---

Fix Pages deploy failing with "Invalid commit message" for long multi-line UTF-8 commits

Previously, multi-line commit messages could cause Pages deployments to fail with "Invalid commit message, it must be a valid UTF-8 string" when the message was close to the 384-byte limit. This happened because the server normalizes line endings from LF to CRLF, increasing the byte count and potentially causing truncation to split a multi-byte UTF-8 character. Commit message line endings are now normalized to CRLF before truncation to match server-side behavior.
