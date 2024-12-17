# @cloudflare/unenv-preset

[unenv](https://github.com/unjs/unenv) preset for cloudflare.

## Usage

```ts
import { cloudflare, env, nodeless } from "@cloudflare/unenv-preset";

const {
	/* ... */
} = env(nodeless, cloudflare);
```
