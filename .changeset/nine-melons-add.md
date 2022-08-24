---
"wrangler": patch
---

feat: `--var name:value` and `--define name:value`

This enables passing values for `[vars]` and `[define]` via the cli. We have a number of usecases where the values to be injected during dev/publish aren't available statically (eg: a version string, some identifier for 3p libraries, etc) and reading those values only from `wrangler.toml` isn't good ergonomically. So we can now read those values when passed through the CLI.

Example: add a var during dev: `wrangler dev --var xyz:123` will inject the var `xyz` with string `"123" `

(note, only strings allowed for `--var`)

substitute a global value: `wrangler dev --define XYZ:123` will replace every global identifier `XYZ` with the value `123`.

The same flags also work with `wrangler publish`.

Also, you can use actual environment vars in these commands. e.g.: `wrangler dev --var xyz:$XYZ` will set `xyz` to whatever `XYZ` has been set to in the terminal environment.
