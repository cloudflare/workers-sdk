---
"wrangler": minor
---

Feature: 'stdin' support for 'secret:bulk'
Added functionality that allows for files and strings to be piped in, or other means of standard input. This will allow for a broader variety of use cases and improved DX.
This implementation is also fully backward compatible with the previous input method of filepath to JSON.

```bash
# Example of piping in a file
> cat ./my-file.json | wrangler secret:bulk

# Example of piping in a string
> echo '{"key":"value"}' | wrangler secret:bulk

# Example of redirecting input from a file
> wrangler secret:bulk < ./my-file.json
```
