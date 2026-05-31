---
"wrangler": patch
---

Show a clear error for invalid API token header characters

Wrangler now detects API tokens containing characters that cannot be sent in the HTTP Authorization header before making an API request. This avoids a low-level ByteString conversion error and helps users recreate or recopy the token without printing the token value.
