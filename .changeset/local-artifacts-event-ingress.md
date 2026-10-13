---
"miniflare": minor
---

Add a private, experimental Artifacts event producer in the local Queue plugin

Local repository and token lifecycle operations now send typed version-one Artifacts events over a private JSRPC binding. The receiver does not retain or deliver events until subscription support is added; Git transport and namespace events are not yet produced.
