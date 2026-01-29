---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Properly display Windows paths in error messages

Windows file paths containing backslash-escape sequences (like `\t` in usernames such as `thepl`) were being interpreted as control characters in error messages, causing paths like `C:\Users\thepl\...` to display incorrectly with tab characters. Paths in error messages are now normalized to use forward slashes, ensuring consistent and readable output across all platforms.
