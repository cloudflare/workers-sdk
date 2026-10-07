---
"@cloudflare/cli-shared-helpers": patch
---

Display the output of `runCommand` when it is captured without `silent`

Setting `captureOutput` without `silent` previously returned no output, because the command's output was inherited by the terminal. The output is now displayed as it is produced and also returned, with stdin left attached so that the command can still prompt the user.
