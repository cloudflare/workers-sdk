---
"wrangler": patch
---

fix: make `wrangler types` honor top level config argument

The `wrangler types` command currently ignores the `-c|--config` argument
(although it is still getting shown in the command's help message). Make
sure that the command honors the flag.
Also, if no config file is detected
present a warning to the user
