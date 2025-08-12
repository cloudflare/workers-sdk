---
"wrangler": minor
---

Add information about local vs. dashboard configuration differences on deploys

When a user changes the remote configuration of a Worker and then tries to re-deploy using Wrangler they will receive a warning mentioning that some config edits have been made via the dashboard and that those will be overridden by the local configuration. They will also be asked if they want to proceed with the deployment or not.

The changes here improve the above flow in the following way:

- if the local changes are only adding configurations the deployment happens without warning the users nor asking for their permissions (since no conflict/data loss happens in this case it should be totally safe to just proceed without inconveniencing users)
- if the local changes are modifying/removing configurations then the differences from the dashboard configurations and the local ones are presented to the user (in a git-like diff format), so that they can know and understand the changes before deciding whether or not they do want to proceed with the deployment
