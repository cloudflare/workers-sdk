---
"wrangler": patch
---

fix: display user-friendly message when Pages function route param names are invalid.

Param names can only contain alphanumeric and underscore characters. Previously the user would see a confusing error message similar to:

```
 TypeError: Unexpected MODIFIER at 8, expected END
```

Now the user is given an error similar to:

```
Invalid Pages function route parameter - "[hyphen-not-allowed]". Parameter names must only contain alphanumeric and underscore characters.
```

Fixes #5540
