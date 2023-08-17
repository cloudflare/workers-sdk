---
"wrangler": patch
---

convert `\\n` into `\n` in wrangler pages deploy commit messages

If I currently run:
```
  $ npx wrangler pages deploy . --commit-message="this is a \ntest"
```
I will see the `\n` in the commit in the dashboard

this is inconsistent with what happens if I have made a proper commit
with the same newline:
```
this is a
test
```

this inconsistency is generated because `\n`s in the `commit-massage` argument, get
converted into `\\n`, so this change reverts that so that this type of commit can be
more inline with the standard git ones