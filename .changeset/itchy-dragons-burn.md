---
"wrangler": patch
---

fix: make `wrangler types` honor top level config argument

the `wrangler types` command currently ignores the `-c|--config` argument
(although it is still getting shown in the command's help message), make
sure that the command honors the flag, also if no config file is detected
present a warning to the user
