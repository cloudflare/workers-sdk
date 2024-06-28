---
"wrangler": patch
---

feature: alias modules in the worker

Sometimes, users want to replace modules with other modules. This commonly happens inside a third party dependency itself. As an example, a user might have imported `node-fetch`, which will probably never work in workerd. You can use the alias config to replace any of these imports with a module of your choice.

Let's say you make a `fetch-nolyfill.js`

```ts
export default fetch; // all this does is export the standard fetch function`
```

You can then configure `wrangler.toml` like so:

```toml
# ...
[alias]
"node-fetch": "./fetch-nolyfill"
```

So any calls to `import fetch from 'node-fetch';` will simply use our nolyfilled version.

You can also pass aliases in the cli (for both `dev` and `deploy`). Like:

```bash
npx wrangler dev --alias node-fetch:./fetch-nolyfill
```
