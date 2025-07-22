# @cloudflare/unenv-preset

[unenv](https://github.com/unjs/unenv) preset for cloudflare.

unenv provides polyfills to add [Node.js](https://nodejs.org/) compatibility for any JavaScript runtime, including browsers and edge workers.

## Usage

```ts
import { cloudflare } from "@cloudflare/unenv-preset";
import { defineEnv } from "unenv";

const { env } = defineEnv({
	presets: [cloudflare],
});

const { alias, inject, external, polyfill } = env;
```

See the unenv [README](https://github.com/unjs/unenv/blob/main/README.md) for more details.

## Tests

This package is tested via wrangler e2e tests.
