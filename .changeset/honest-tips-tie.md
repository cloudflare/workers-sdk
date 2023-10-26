---
"wrangler": patch
---

fix: store temporary files in `.wrangler`

As Wrangler builds your code, it writes intermediate files to a temporary
directory that gets cleaned up on exit. Previously, Wrangler used the OS's
default temporary directory. On Windows, this is usually on the `C:` drive.
If your source code was on a different drive, our bundling tool would generate
invalid source maps, breaking breakpoint debugging. This change ensures
intermediate files are always written to the same drive as sources. It also
ensures unused build outputs are cleaned up when running `wrangler pages dev`.

This change also means you no longer need to set `cwd` and
`resolveSourceMapLocations` in `.vscode/launch.json` when creating an `attach`
configuration for breakpoint debugging. Your `.vscode/launch.json` should now
look something like...

```jsonc
{
	"configurations": [
		{
			"name": "Wrangler",
			"type": "node",
			"request": "attach",
			"port": 9229,
			// These can be omitted, but doing so causes silent errors in the runtime
			"attachExistingChildren": false,
			"autoAttachChildProcesses": false
		}
	]
}
```
