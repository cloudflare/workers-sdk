---
"wrangler": patch
---

Fix `/dev/fd/<n>` paths, such as `--secrets-file <(...)`, failing with `EBADF` on macOS

Wrangler's `bin/wrangler.js` re-spawns Node to run the CLI, and on macOS `child_process.spawn()` only passes the file descriptors listed in `stdio` to the child. A path created by shell process substitution therefore pointed at a closed file descriptor and failed with `EBADF: bad file descriptor, open '/dev/fd/63'`. Wrangler now forwards the open file descriptors named by `/dev/fd/<n>` arguments to the child process, so `wrangler deploy --secrets-file <(...)` works when `wrangler` is run directly. Launchers that spawn Wrangler through Node themselves, such as `npx` or `pnpm exec`, still drop the file descriptor before Wrangler starts.
