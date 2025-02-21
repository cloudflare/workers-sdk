---
"create-cloudflare": patch
---

This change makes the user facing message C3 displays while waiting for DNS propagation, more friendly/informative. The idea is to inform users that DNS propagation might sometimes take even up to 2 minutes. This will hopefully prevent confusion around whether how long the process will take, or whether the process is stuck, etc.
