---
"@cloudflare/vite-plugin": minor
"@cloudflare/containers-shared": minor
"wrangler": minor
---

Containers: Allow users to directly authenticate external image registries in local dev

Previously, we always queried the API for stored registry credentials and used those to pull images. This means that if you are using an external registry (ECR, dockerhub) then you have to configure registry credentials remotely before running local dev.

Now you can directly authenticate with your external registry provider (using `docker login` etc.), and Wrangler or Vite will be able to pull the image specified in the `containers.image` field in your config file.

The Cloudflare-managed registry (registry.cloudflare.com) currently still does not work with the Vite plugin.
