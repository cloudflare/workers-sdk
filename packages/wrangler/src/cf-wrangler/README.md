# cf-wrangler delegate

`cf-wrangler` is the experimental development and build delegate used by `cf`
when a project does not have a native framework command. Once cf spawns the
delegate, it dispatches in-process without invoking a shell or respawning
Wrangler. The existing Wrangler dev session owns signal handling and teardown.

## Development arguments

The `dev` verb accepts Wrangler's development server options and aliases, using
the same definitions, defaults, choice validation, and runtime as `wrangler dev`.
For example:

```sh
cf dev --inspector-port 9229 --port=8788
cf dev --mode staging -- --local --persist-to "custom state" --var "MESSAGE:hello world"
cf dev -- --env-file ../../.env --env-file .env.local
```

cf forwards server arguments,
including tokens after `--`. cf consumes its own global options before that
separator. In particular, `cf dev --local` and `cf dev --persist-to ...` are
rejected by cf itself; put those server options after `--`. cf's `--mode` is
forwarded to this delegate and selects the named configuration environment.
The separator is removed by cf before invoking `cf-wrangler`.

`--env-file` selects explicit files for local Worker bindings, including shared
files outside the project directory. Paths resolve relative to the configuration
directory. The option can be repeated; values in later files override earlier
ones. Explicit files replace automatic `.dev.vars` and `.env` discovery without
requiring `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`.

The delegate intentionally differs from `wrangler dev` in these ways:

- Config files and the entrypoint are discovered from the project. Positional
  scripts, `--script`, `--config` / `-c`, and `--cwd` are unsupported.
- Use `--mode` instead of `--env` / `-e`.
- Development is local, with remote bindings allowed by configuration.
  `--local` / `-l` disables remote bindings; `--remote` / `-r`, `--no-local`, and
  `--local=false` are unsupported.
- The new configuration format is always enabled. It cannot be disabled with
  `--experimental-new-config` or its aliases. Provisioning and automatic resource
  creation remain disabled; their Wrangler global options are unsupported.
- Other Wrangler global options, including `--profile` and
  `--install-skills`, are unsupported. cf supplies authentication through its
  inherited profile context.
- Types are not generated unless `--types` is passed. State defaults to
  `.cloudflare/state`; `--persist-to` overrides it.

Unknown options, malformed arguments, and incompatible dev option combinations
print a single-line error and fail with exit code 2. Runtime errors fail with
exit code 1. Options specific to another server (such as Vite) are not accepted
by this delegate.

`build` continues to accept only `--mode`; these server options apply to `dev`.
