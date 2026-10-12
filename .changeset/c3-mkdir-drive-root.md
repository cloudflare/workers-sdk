---
"create-cloudflare": patch
---

Skip `mkdir` when the project parent directory already exists, so `create-cloudflare` works at a Windows drive root (`E:\`) instead of throwing `EPERM`.
