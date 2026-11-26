---
"wrangler": patch
---

Show every namespace in the `wrangler ai-search create` namespace picker

Previously, the interactive `Select a namespace:` picker only listed the first page of namespaces returned by the API, so on accounts with more than 20 AI Search namespaces the rest could not be selected. The picker now pages through the whole list.
