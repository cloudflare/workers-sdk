---
"wrangler": patch
---

Fix Python Workers deployment failing on Windows due to path separator handling

Previously, deploying Python Workers on Windows would fail because the backslash path separator (`\`) was not properly handled, causing the entire full path to be treated as a single filename. The deployment process now correctly normalizes paths to use forward slashes on all platforms.
