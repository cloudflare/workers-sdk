---
"create-cloudflare": patch
---

Clamp the scaffolded `compatibility_date` to what the bundled `workerd` supports

C3 wrote today's date as the `compatibility_date` of a new project, but the `workerd` that the project pins can lag a day or two behind. When it did, the freshly scaffolded project failed to start on its very first `dev` with an error about an unsupported compatibility date, before any code had been written. The generated date is now capped at the newest date the bundled `workerd` recognises.
