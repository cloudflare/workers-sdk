# HTTP fetch to a container

This example shows a simple container setup where a DO passes requests through to a node server.

## Simplified Container Configuration

Only need to define the `[[containers]]` section in `wrangler.toml`. The Durable Object bindings and migrations are automatically generated:

```jsonc
{
  "containers": [
    {
      "name": "container",
      "class_name": "FixtureTestContainer", 
      "image": "./Dockerfile",
      "max_instances": 2
    }
  ]
}
```

The following are now auto-generated:
- `durable_objects.bindings` with binding name `CONTAINER` 
- `migrations` with `v1` tag including `FixtureTestContainer`
