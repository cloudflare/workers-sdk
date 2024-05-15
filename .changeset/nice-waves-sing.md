---
"wrangler": minor
---

fix: Show feedback on Pages project deployment failure

Today, if uploading a Pages Function, or deploying a Pages project fails for whatever reason, there’s no feedback shown to the user. Worse yet, the shown message is misleading, saying the deployment was successful, when in fact it was not:

```
✨ Deployment complete!
```

This commit ensures that we provide users with:

- the correct feedback with respect to their Pages deployment
- the appropriate messaging depending on the status of their project's deployment status
- the appropriate logs in case of a deployment failure
