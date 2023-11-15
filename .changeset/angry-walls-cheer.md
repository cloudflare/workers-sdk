---
"create-cloudflare": patch
---

fix: ensure shell scripts work on Windows

Our use of `shell-quote` was causing problems on Windows where it was
escaping character (such as `@`) by placing a backslash in front.
This made Windows think that such path arguments, were at the root.

For example, `npm install -D @cloudflare/workers-types` was being converted to
`npm install -D \@cloudflare/workers-types`, which resulted in errors like:

```
npm ERR! enoent ENOENT: no such file or directory, open 'D:\@cloudflare\workers-types\package.json'
```

Now we just rely directly on the Node.js `spawn` API to avoid any shell quoting
concerns. This has resulted in a slightly less streamlined experience for people
writing C3 plugins, but has the benefit that the developer doesn't have to worry
about quoting spawn arguments.

Closes https://github.com/cloudflare/workers-sdk/issues/4282
