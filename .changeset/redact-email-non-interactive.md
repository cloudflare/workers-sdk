---
"wrangler": patch
---

fix: redact email addresses and account names in non-interactive mode

To prevent sensitive information from being exposed in public CI logs, email addresses and account names are now redacted when running in non-interactive mode (e.g., CI environments). Account IDs remain visible to aid debugging.
