---
"wrangler": minor
---

feat: add support for redirecting Wrangler to a generated config when running deploy-related commands

This new feature is designed for build tools and frameworks to provide a deploy-specific configuration,
which Wrangler can use instead of user configuration when running deploy-related commands.
It is not expected that developers of Workers will need to use this feature directly.

### Affected commands

The commands that use this feature are:

- `wrangler deploy`
- `wrangler dev`
- `wrangler versions upload`
- `wrangler versions deploy`
- `wrangler pages deploy`
- `wrangler pages build`
- `wrangler pages build-env`

### Config redirect file

When running these commands, Wrangler will look up the directory tree from the current working directory for a file at the path `.wrangler/deploy/config.json`. This file must contain only a single JSON object of the form:

```json
{ "configPath": "../../path/to/wrangler.json" }
```

When this file exists Wrangler will follow the `configPath` (relative to the `.wrangler/deploy/config.json` file) to find an alternative Wrangler configuration file to load and use as part of this command.

When this happens Wrangler will display a warning to the user to indicate that the configuration has been redirected to a different file than the user's configuration file.

### Custom build tool example

A common approach that a build tool might choose to implement.

- The user writes code that uses Cloudflare Workers resources, configured via a user `wrangler.toml` file.

  ```toml
  name = "my-worker"
  main = "src/index.ts"
  [[kv_namespaces]]
  binding = "<BINDING_NAME1>"
  id = "<NAMESPACE_ID1>"
  ```

  Note that this configuration points `main` at user code entry-point.

- The user runs a custom build, which might read the `wrangler.toml` to find the entry-point:

  ```bash
  > my-tool build
  ```

- This tool generates a `dist` directory that contains both compiled code and a new deployment configuration file, but also a `.wrangler/deploy/config.json` file that redirects Wrangler to this new deployment configuration file:

  ```plain
  - dist
    - index.js
  	- wrangler.json
  - .wrangler
    - deploy
  	  - config.json
  ```

  The `dist/wrangler.json` will contain:

  ```json
  {
  	"name": "my-worker",
  	"main": "./index.js",
  	"kv_namespaces": [{ "binding": "<BINDING_NAME1>", "id": "<NAMESPACE_ID1>" }]
  }
  ```

  And the `.wrangler/deploy/config.json` will contain:

  ```json
  {
  	"configPath": "../../dist/wrangler.json"
  }
  ```
