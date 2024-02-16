---
"miniflare": minor
---

feat: allow easy binding to current worker

Previously, if you wanted to create a service binding to the current Worker, you'd need to know the Worker's name. This is usually possible, but can get tricky when dealing with many Workers. This change adds a new `kCurrentWorker` symbol that can be used instead of a Worker name in `serviceBindings`. `kCurrentWorker` always points to the Worker with the binding.

<!--prettier-ignore-start-->

```js
import { Miniflare, kCurrentWorker } from "miniflare";

const mf = new Miniflare({
  serviceBindings: {
    SELF: kCurrentWorker,
  },
  modules: true,
  script: `export default {
    fetch(request, env, ctx) {
      const { pathname } = new URL(request.url);
      if (pathname === "/recurse") {
        return env.SELF.fetch("http://placeholder");
      }
      return new Response("body");
    }
  }`,
});

const response = await mf.dispatchFetch("http://placeholder/recurse");
console.log(await response.text()); // body
```

<!--prettier-ignore-end-->
