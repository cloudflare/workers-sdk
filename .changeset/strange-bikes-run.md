---
"create-cloudflare": patch
---

fix: correctly find the latest version of create-cloudflare

When create-cloudflare starts up, it checks to see if the version being run
is the latest available on npm.

Previously this check used `npm info` to look up the version.
But was prone to failing if that command returned additional unexpected output
such as warnings.

Now we make a fetch request to the npm REST API directly for the latest version,
which does not have the problem of unexpected warnings.

Since the same approach is used to compute the latest version of workerd, the
function to do this has been put into a helper.

Fixes #4729
