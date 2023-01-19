---
"wrangler": minor
---

Added a positional in the 'Deployments' command <deployment-id>.
<deployment-id> will get the details of the deployment, including versioned script, bindings, and usage model information.

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
