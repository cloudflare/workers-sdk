---
"miniflare": patch
---

Exclude `metadata.sqlite` when listing Durable Object instances

An upcoming version of workerd stores per-namespace alarm metadata in a `metadata.sqlite` file alongside per-actor `.sqlite` files. The local explorer's DO object listing was treating this file as a Durable Object instance, inflating counts and breaking pagination. This file is now filtered out.
