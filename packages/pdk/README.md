## @cloudflare/pdk

The Platform Development Kit.

2 core features: Development, and Publishing.

```js
// publish a script to a namespace
import { publish } from "@cloudflare/pdk";
await publish(scriptContent, options);

// start a mini server for development
import { dev } from "@cloudflare/pdk";
const server = await dev(scriptContent, options);
const response = await server.fetch(request);
```
