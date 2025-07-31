# Fixture: Worker With Unsafe External Plugin

This example shows how a user can define their own Miniflare plugin and use it for local development via an `unsafe` binding.

The Worker defined here uses a locally installed Plugin (`@fixture/unsafe-external-plugin`) that implements the local simulator for `some-unsafe-simulator`.

```jsonc
"unsafe": {
		"bindings": [
			{
				"name": "UNSAFE_SERVICE_BINDING",
				"dev": {
					"package": "@fixture/unsafe-external-plugin",
					"plugin": "unsafe-plugin",
					"pluginOptions": {
						"UNSAFE_SERVICE_BINDING": {
							"emitLogs": true
						}
					}
				},
				"type": "service",
				"service": "some-unsafe-service"
			}
		]
	}
```