---
"miniflare": minor
---

feat: bind `this` to current `Miniflare` instance in custom service binding handlers

Previously, `this` was unbound in function-valued `serviceBindings`. This change binds it to the current `Miniflare` instance, for easy access to the correct bindings when re-using service functions across instances.

<!--prettier-ignore-start-->

```js
import assert from "node:assert";
import { Miniflare, Response } from "miniflare";

const mf = new Miniflare({
  // ...
  serviceBindings: { 
    SERVICE(request) {
      assert(this === mf);
      return new Response();
    },
  },
});
```

<!--prettier-ignore-end-->
