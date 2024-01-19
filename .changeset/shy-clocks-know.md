---
"create-cloudflare": minor
---

Adds C3 support for external templates hosted in git repositories via the `--template <source>` option.

The source may be specified as any of the following:

- `user/repo`
- `git@github.com:user/repo`
- `https://github.com/user/repo`
- `user/repo/some-template` (subdirectories)
- `user/repo#canary` (branches)
- `user/repo#1234abcd` (commit hash)
- `bitbucket:user/repo` (BitBucket)
- `gitlab:user/repo` (GitLab)

See the `degit` [docs](https://github.com/Rich-Harris/degit) for more details.

At a minimum, templates must contain the following:

- `package.json`
- `wrangler.toml`
- `src/` containing a worker script referenced from `wrangler.toml`

See the [templates folder](https://github.com/cloudflare/workers-sdk/tree/main/templates) of this repo for more examples.
