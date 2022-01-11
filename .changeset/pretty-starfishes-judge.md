---
"wrangler": patch
---

Add `--compatibility-date`, `--compatibility-flags`, `--latest` cli arguments to `dev` and `publish`.

- A cli arg for adding a compatibility data, e.g `--compatibility_date 2022-01-05`
- A shorthand `--latest` that sets `compatibility_date` to today's date. Usage of this flag logs a warning.
- `latest` is NOT a config field in `wrangler.toml`.
- In `dev`, when a compatibility date is not available in either `wrangler.toml` or as a cli arg, then we default to `--latest`.
- In `publish` we error if a compatibility date is not available in either `wrangler.toml` or as a cli arg. Usage of `--latest` logs a warning.
- We also accept compatibility flags via the cli, e.g: `--compatibility-flags formdata_parser_supports_files`
