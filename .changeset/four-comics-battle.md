---
"wrangler": patch
---

fix: don't suggest reporting user errors to GitHub

Wrangler has two different types of errors: internal errors caused by something going wrong, and user errors caused by an invalid configuration. Previously, we would encourage users to submit bug reports for user errors, even though there's nothing we can do to fix them. This change ensures we only suggest this for internal errors.
