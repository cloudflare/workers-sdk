---
"wrangler": minor
---

Remove dispatch namespace rename command

Workers for Platforms metrics are currently tied to the name of the dispatch namespace, and so changing that unexpectedly changes the metrics of your invocations. So for now, we want to restrict updates to namespaces, making the name stable.

While this could be considered breaking, it doesn't seem that this command has ever been used - only a select few dispatch namespaces have ever been updated through the API.
