# Request Cloning

This route + tests is for testing the `request.clone()` call that is currently causing workerd
runtime errors: https://github.com/cloudflare/workers-sdk/issues/3259

The cloning should be in the next wrangler major release, optimally alongside with this route + tests

## Why can't we fix it in a patch release

The issue is caused by the `request.clone()` that we perform in `pages-template-workers.ts`
we did remove it when there is a single handler, but we can't remove it when there are multiple
handlers because more than one could try reading the request body.

For example, the following code would break if we were to unconditionally remove the `.clone()` call:

```
// functions/_middleware.ts

export const onRequest = async ({ request, next }) => {
  console.log(await request.text())
  return next()
}
```

```
// functions/foo.ts

export const onRequest = async ({ request }) => {
  return new Response(await request.text())
}
```

Anyways in the above code the cloning of the request should be up to the user (if they want to read the request
body more than once they should clone the request themselves), so we should remove the `.clone()` in a major
release and let users know that no automatic cloning is going to be performed under the hood for them.
