---
"create-cloudflare": patch
---

fix: commit changes when framework cli initialized the git repository

Currently if a framework CLI initializes the git repository then
C3 fails to commit its changes, fix such erroneous behavior
