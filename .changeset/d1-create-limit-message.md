---
"wrangler": patch
---

Improve the `wrangler d1 create` error message when the database limit is reached

When `d1 create` fails because the account has hit its database limit, the error now points to the relevant next steps — upgrading on the Workers Free plan or requesting a higher limit on a paid plan — alongside the existing commands to list and delete databases. Previously it only suggested deleting unused databases.
