# @cloudflare/unenv-preset

[unenv](https://github.com/unjs/unenv) preset for cloudflare.

## Usage

```ts
import { cloudflare } from "@cloudflare/unenv-preset";
import { defineEnv } from "unenv";

const { env } = defineEnv({
	nodeCompat: true,
	presets: [cloudflare],
});
```
