---
"wrangler": patch
---

fix: `wrangler init` should not crash if Git is not available on Windows

We check for the presence of Git by trying to run `git --version`.
On non-Windows we get an Error with `code` set to "ENOENT".
One Windows we get a different error:

```
{
  "shortMessage":"Command failed with exit code 1: git --version",
  "command":"git --version",
  "escapedCommand":"git --version",
  "exitCode":1,
  "stdout":"",
  "stderr":"'git' is not recognized as an internal or external command,\r\noperable program or batch file.",
  "failed":true,
  "timedOut":false,
  "isCanceled":false,
  "killed":false
}
```

Since we don't really care what the error is, now we just assume that Git
is not available if an error is thrown.

Fixes #1022
