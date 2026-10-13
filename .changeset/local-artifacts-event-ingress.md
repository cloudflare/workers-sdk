---
"miniflare": minor
---

Add a private, experimental Artifacts event producer in the local Queue plugin

Local repository and token lifecycle operations now send typed version-one Artifacts events to a private Queue-plugin JSRPC service. This is groundwork for local subscriptions: the bounded diagnostic inbox is not a user Queue or Workflow trigger, and Git transport and namespace events are not yet produced.
