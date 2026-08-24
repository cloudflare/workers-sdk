---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add `--secrets-file-mode` to `wrangler deploy` and `wrangler versions upload` for replacing remote secrets

By default `--secrets-file` is additive: remote secrets that are not present in the file are kept. The new `--secrets-file-mode` flag makes that behavior explicit and adds an opt-in replace mode:

- `--secrets-file-mode merge` (the default) keeps remote secrets that are not present in the file
- `--secrets-file-mode replace` deletes them, so the Worker's secret set converges to the contents of the file

For example:

`wrangler deploy --secrets-file .env.production --secrets-file-mode replace`

Secrets declared in the `secrets.required` config field are always kept via inherit bindings, even in replace mode; replace mode only drops secrets that are neither supplied in the file nor declared as required. Before uploading, Wrangler always logs a warning listing the remote secrets that will be dropped (in CI as well, so deploy logs carry an audit trail); with `--strict` the upload aborts instead.

For `wrangler versions upload`, replace mode means the new version carries only the supplied secrets (plus required ones), and the removal of the others takes effect when that version is deployed.

The flag can only be used together with `--secrets-file`, and the default behavior without it is unchanged.
