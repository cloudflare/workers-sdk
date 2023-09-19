---
"wrangler": minor
---

feat: add support for Visual Studio Code's built-in breakpoint debugger

Wrangler now supports breakpoint debugging with Visual Studio Code's debugger.
Create a `.vscode/launch.json` file with the following contents...

```json
{
	"configurations": [
		{
			"name": "Wrangler",
			"type": "node",
			"request": "attach",
			"port": 9229,
			"cwd": "/",
			"resolveSourceMapLocations": null,
			"attachExistingChildren": false,
			"autoAttachChildProcesses": false
		}
	]
}
```

...then run `wrangler dev`, and launch the configuration.
