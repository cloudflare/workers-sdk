---
"create-cloudflare": patch
---

adjusted arguments passing so that arguments following an extra `--` are
passed to the underlying cli (if any)

For example:
```
$ npm create cloudflare -- --framework=X -- -a -b
```
now will run the framework X's cli with the `-a` and `-b` arguments
(such arguments will be completely ignored by C3)
