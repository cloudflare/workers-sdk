---
"@cloudflare/containers-shared": patch
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Stop running Docker at the end of builds for projects with no Containers

Builds that write the Build Output Specification ran `docker image ls` on every build to find image tags left by a previous build, even when the project configured no Containers. On a machine with Docker installed this added about a quarter of a second to each build, and the build waited on the Docker CLI for as long as it took to respond. The lookup is now skipped when the project has no Containers and the build output being replaced had none either. Projects that configure Containers, and the first build after the last Container is removed, still remove previous tags as before.
