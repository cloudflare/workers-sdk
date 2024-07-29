---
"create-cloudflare": minor
---

feat: update submenu userflow

Now, we will first prompt for the kind of templates that should be created and show a different set of templates depending on the category. If the template selected supports different languages, we will also ask for the language user preferred.

Two new arguments are also added to support the new structure: `--category` and `--lang`. For more details, please refer to our [docs](https://developers.cloudflare.com/pages/get-started/c3#cli-arguments).
