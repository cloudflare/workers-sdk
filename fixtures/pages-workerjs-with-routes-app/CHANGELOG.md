# pages-workerjs-with-routes-app

## 0.0.1

### Patch Changes

- [#2065](https://github.com/cloudflare/wrangler2/pull/2065) [`14c44588`](https://github.com/cloudflare/wrangler2/commit/14c44588c9d22e9c9f2ad2740df57809d0cbcfbc) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix(pages): `wrangler pages dev` matches routing rules in `_routes.json` too loosely

  Currently, the logic by which we transform routing rules in `_routes.json` to
  regular expressions, so we can perform `pathname` matching & routing when we
  run `wrangler pages dev`, is too permissive, and leads to serving incorrect
  assets for certain url paths.

  For example, a routing rule such as `/foo` will incorrectly match pathname
  `/bar/foo`. Similarly, pathname `/foo` will be incorrectly matched by the
  `/` routing rule.
  This commit fixes our routing rule to pathname matching logic and brings
  `wrangler pages dev` on par with routing in deployed Pages projects.
