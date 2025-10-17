---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

always load container image into local store during build


BuildKit supports different [build drivers](https://docs.docker.com/build/builders/drivers/). When using the more modern `docker-container` driver (which is now the default on some systems, e.g. a standard Docker installation on Fedora Linux), it will not automatically load the built image into the local image store. Since wrangler expects the image to be there (e.g. when calling `getImageRepoTags`), it will thus fail, e.g.:

```
⎔ Preparing container image(s)...
[+] Building 0.3s (8/8) FINISHED                                                                                                                                                                                                     docker-container:default

[...]

WARNING: No output specified with docker-container driver. Build result will only remain in the build cache. To push result image into registry use --push or to load image into docker use --load

✘ [ERROR] failed inspecting image locally: Error response from daemon: failed to find image cloudflare-dev/sandbox:f86e40e4: docker.io/cloudflare-dev/sandbox:f86e40e4: No such image

```

Explicitly setting the `--load` flag (equivalent to `-o type=docker`) during the build fixes this and should make the build a bit more portable without requiring users to change their default build driver configuration.
