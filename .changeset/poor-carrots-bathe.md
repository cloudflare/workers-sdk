---
"miniflare": minor
---

feat: pass `Miniflare` instance as argument to custom service binding handlers

This change adds a new `Miniflare`-typed parameter to function-valued service binding handlers. This provides easy access to the correct bindings when re-using service functions across instances.

<!--prettier-ignore-start-->

```js
import assert from "node:assert";
import { Miniflare, Response } from "miniflare";

const mf = new Miniflare({
  // ...
  serviceBindings: {
    SERVICE(request, instance) {
      assert(instance === mf);
      return new Response();
    },
  },
});
```

<!--prettier-ignore-end-->
