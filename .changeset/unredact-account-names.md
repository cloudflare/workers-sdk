---
"wrangler": patch
---

Stop redacting account names in non-interactive mode

Account names are not secrets and redacting them in non-interactive/CI environments
makes it difficult for agents and automated tools to identify which account to use.
Email addresses remain redacted in non-interactive mode to protect PII.
