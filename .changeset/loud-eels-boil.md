---
"create-cloudflare": patch
---

avoid framework commit creation inside monorepos

currently for frameworks C3 generates a commit based on the current directory upon project
creation, this also applies inside monorepos where the user could not want a commit at this
point in time, so these changes prevent such commits to be made, showing a warning to the
user instead which is then free to commit manually when appropriate
