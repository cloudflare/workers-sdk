---
"wrangler": patch
---

fix `wrangler dev` logs being logged on the incorrect level in some cases

currently the way `wrangler dev` prints logs is faulty, for example the following code

```js
console.error("this is an error");
console.warn("this is a warning");
console.debug("this is a debug");
```

inside a worker would cause the following logs:

```text
✘ [ERROR] this is an error

✘ [ERROR] this is a warning

this is a debug
```

(note that the warning is printed as an error and the debug log is printed even if by default it should not)

the changes here make sure that the logs are instead logged to their correct level, so for the code about the following will be logged instead:

```text
✘ [ERROR] this is an error

▲ [WARNING] this is a warning
```

(running `wrangler dev` with the `--log-level=debug` flag will also cause the debug log to be included as well)
