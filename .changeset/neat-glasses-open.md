---
"@cloudflare/local-explorer-ui": patch
---

Fixed table selection dropdown incorrect z-index.

Previously, the dropdown you used to select a table in the data studio had an incorrect or missing z-index, meanint it conflicted with the table row header & was partially cut off when you had too many tables. This change ensures that the dropdown is always "on top" and visible.
