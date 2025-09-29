---
"create-cloudflare": patch
---

Do not override any `.env` settings in `.gitignore` files

Previously we only looked for `.env*` in the `gitignore` but now we cover more cases such as:

- `.env`
- `.env\*`
- `.env.<local|production|staging|...>`
- `.env\*.<local|production|staging|...>`
