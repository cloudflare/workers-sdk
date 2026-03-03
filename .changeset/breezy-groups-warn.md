---
"@cloudflare/containers-shared": patch
"wrangler": minor
---

Users are now able to configure DockerHub credentials and have containers reference images stored there.

DockerHub can be configured as follows:

```sh
echo $PAT_TOKEN | npx wrangler@latest containers registries configure docker.io --dockerhub-username=user --secret-name=DockerHub_PAT_Token
```

Containers can then specify an image from DockerHub in their `wrangler.jsonc` as follows:

```jsonc
"containers": {
  "image": "docker.io/namespace/image:tag",
  ...
}
```
