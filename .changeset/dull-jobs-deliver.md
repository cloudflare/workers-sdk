---
"wrangler": minor
---

Add new `getBindingsProxy` utility to the wrangler package

The new utility is part of wrangler's js api (it is not part of the wrangler CLI) and its use is to provide proxy objects to bindings, such objects can be used in nodejs code as if they were actual bindings

The utility reads the `wrangler.toml` file present in the current working directory in order to discern what bindings should be available (a `wrangler.json` file can be used too, as well as config files with custom paths).

## Example

Assuming that in the current working directory there is a `wrangler.toml` file with the following
content:

```
[[kv_namespaces]]
binding = "MY_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

The utility could be used in a nodejs script in the following way:

```js
import { getBindingsProxy } from "wrangler";

// we use the utility to get the bindings proxies
const { bindings, dispose } = await getBindingsProxy();

// we get access to the KV binding proxy
const myKv = bindings.MY_KV;
// we can then use the proxy in the same exact way we'd use the
// KV binding in the workerd runtime, without any API discrepancies
const kvValue = await myKv.get("my-kv-key");

console.log(`
    KV Value = ${kvValue}
`);

// we need to dispose of the underlying child process in order for this nodejs script to properly terminate
await dispose();
```
