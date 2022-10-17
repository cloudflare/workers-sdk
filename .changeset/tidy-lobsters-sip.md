---
"wrangler": patch
---

Catch unsupported terminal errors and provide a nicer error message.

Wrangler depends on terminals supporting [raw mode](https://en.wikipedia.org/wiki/Terminal_mode). Previously, attempting to run wrangler from a terminal that didn't support raw mode would result in
an Ink error, which was both an exposure of an internal implementation detail to the user and also not actionable:

```text
  ERROR Raw mode is not supported on the current process.stdin, which Ink uses
       as input stream by default.
       Read about how to prevent this error on
       https://github.com/vadimdemedes/ink/#israwmodesupported
```

Now, we provide a much nicer error, which provides an easy next step for th user:

```text

ERROR: This terminal doesn't support raw mode.

Wrangler uses raw mode to read user input and write output to the terminal, and won't function correctly without it.

Try running your previous command in a terminal that supports raw mode, such as Command Prompt or Powershell.
```

Closes #1992
