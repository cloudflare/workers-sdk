---
"create-cloudflare": patch
---

fix: display helpful error message when no accounts found during deployment

Previously, C3 would display `TypeError: Cannot read properties of undefined (reading 'value')` if you were logged in as a user without access to any accounts. This change ensures a more appropriate error message is displayed in this case.
