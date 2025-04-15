---
"create-cloudflare": minor
---

Add --template-mode argument to create-cloudflare to support templating from private repositories

create-cloudflare uses degit under the hood to clone template git repositories. degit will attempt to download a tar file of the HEAD of a repository if it is served up on one of several allow listed repository hosting services including GitHub. However, the tar support does not support templating from private repositories. To support that, we needed to create the ability to tell degit to use "git" mode to download the template using the user's git credentials.
