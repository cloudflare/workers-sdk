---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Add support for loading local dev vars from .env files

If there are no `.dev.vars` or `.dev.vars.<environment>` files, when running Wrangler or the Vite plugin in local development mode,
they will now try to load additional local dev vars from `.env`, `.env.local`, `.env.<environment>` and `.env.<environment>.local` files.

These loaded vars are only for local development and have no effect in production to the vars in a deployed Worker.
Wrangler and Vite will continue to load `.env` files in order to configure themselves as a tool.

Further details:

- In `vite build` the local vars will be computed and stored in a `.dev.vars` file next to the compiled Worker code, so that `vite preview` can use them.
- The `wrangler types` command will similarly read the `.env` files (if no `.dev.vars` files) in order to generate the `Env` interface.
- If the `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV` environment variable is `false` then local dev variables will not be loaded from `.env` files.
- If the `CLOUDFLARE_INCLUDE_PROCESS_ENV` environment variable is `true` then all the environment variables found on `process.env` will be included as local dev vars.
- Wrangler (but not Vite plugin) also now supports the `--env-file=<path/to/dotenv/file>` global CLI option. This affects both loading `.env` to configure Wrangler the tool as well as loading local dev vars.
