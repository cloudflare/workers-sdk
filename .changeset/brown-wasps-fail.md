---
"wrangler": minor
---

feature: add `deployment view` and `deployment rollbak` subcommands

`deployment view <deployment-id>` will get the details of a deployment, including versioned script, bindings, and usage model information.
This information can be used to help debug bad deployments or get insights on changes between deployments.

`deployment rollback [deployment-id]` will rollback to a specific deployment in the runtime. This will be useful in situations like recovering from a bad
deployment quickly while resolving issues. If a deployment id is not specified wrangler will rollback to the previous deployment. This rollback only changes the code in the runtime and doesn't affect any code or configurations
in a developer's local setup.

example of `view <deployment-id>` output:

```ts
	{
    Tag: '',
    Number: 0,
    'Metadata.author_id': 'Picard-Gamma-6-0-7-3',
    'Metadata.author_email': 'picard@vinyard.com',
    'Metadata.source': 'wrangler',
    'Metadata.created_on': '2021-01-01T00:00:00.000000Z',
    'Metadata.modified_on': '2021-01-01T00:00:00.000000Z',
    'resources.script': {
      etag: 'mock-e-tag',
      handlers: [ 'fetch' ],
      last_deployed_from: 'wrangler'
    },
    'resources.bindings': []
  }



  export default {
    async fetch(request) {
      return new Response('Hello World from Deployment 1701-E');
    },
  };
```
