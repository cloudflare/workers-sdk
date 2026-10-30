---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Honor explicit auth profiles in the `cf-vite` and `cf-wrangler` development delegates

The delegates now accept `--profile`, allowing `cf dev --profile work` to use the selected cf profile instead of the profile bound to the project directory. The `cf-wrangler` delegate also uses cf's credential store and OAuth flow for development authentication.
