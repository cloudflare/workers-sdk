---
"wrangler": patch
---

feat: support wrangler 1.x module specifiers with a deprecation warning

This implements wrangler 1.x style module specifiers, but also logs a deprecation warning for every usage.

Consider a project like so:

```
  project
  ├── index.js
  └── some-dependency.js
```

where the content of `index.js` is:

```jsx
import SomeDependency from "some-dependency.js";
addEventListener("fetch", (event) => {
  // ...
});
```

`wrangler` 1.x would resolve `import SomeDependency from "some-dependency.js";` to the file `some-dependency.js`. This will work in `wrangler` v2, but it will log a deprecation warning. Instead, you should rewrite the import to specify that it's a relative path, like so:

```diff
- import SomeDependency from "some-dependency.js";
+ import SomeDependency from "./some-dependency.js";
```

In a near future version, this will become a breaking deprecation and throw an error.

(This also updates `workers-chat-demo` to use the older style specifier, since that's how it currently is at https://github.com/cloudflare/workers-chat-demo)

Known issue: This might not work as expected with `.js`/`.cjs`/`.mjs` files as expected, but that's something to be fixed overall with the module system.

Closes https://github.com/cloudflare/wrangler2/issues/586
