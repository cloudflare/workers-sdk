# create-cloudflare

> Create new Cloudflare projects with one command

> **Note**
> This package has now been sunsetted! We recommend using the `wrangler generate [name] [template]` command to create new projects with templates.

## Usage

You may use `yarn`, `pnpm`, or `npm` to invoke the [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) package:

```
$ npm init cloudflare <directory> <source> -- [options]
# or
$ pnpm create cloudflare <directory> <source> [options]
# or
$ yarn create cloudflare <directory> <source> [options]
```

> **Note:** All recent versions of `npm`, `yarn`, and `pnpm` support this feature!

### Sources

You may select the name of any subdirectory within the [`cloudflare/templates`](https://github.com/cloudflare/templates) repository to create your project; for example, `worker-typescript` and `examples/fast-google-fonts` are both valid subdirectory names.

You may also use any valid git repository address; for example:

> **Note:** Optional segments are denoted within `[]` characters.

- `[user@]host.xz:path/to/repo.git[#branch]`
- `git://host.xz[:port]/path/to/repo.git[#branch]`
- `ssh://[user@]host.xz[:port]/path/to/repo.git[#branch]`
- `http[s]://host.xz[:port]/path/to/repo.git[#branch]`
- `ftp[s]://host.xz[:port]/path/to/repo.git[#branch]`

### Examples

To create a `my-project` directory using the [`worker-typescript`](https://github.com/cloudflare/templates/tree/main/worker-typescript) template, you may run one of the following commands:

```sh
$ npm init cloudflare my-project worker-typescript
# or
$ yarn create cloudflare my-project worker-typescript
# or
$ pnpm create cloudflare my-project worker-typescript
```

Other examples include:

```sh
$ yarn create cloudflare my-project worker --force
$ npm init cloudflare my-project worker-router -- --debug
$ pnpm create cloudflare my-project https://github.com/user/repo.git#branch
```

### Options

- `--force` — Allow target directory overwrite
- `--no-init` — Do not initialize a git repository
- `--debug` — Print additional error details
- `--version` or `-v` — Displays current version
- `--help` or `-h — Displays help text

## Related

- [`cloudflare/templates`](https://github.com/cloudflare/templates) - A collection of stater templates and examples for Cloudflare Workers and Pages

## License

MIT © [Luke Edwards](https://lukeed.com)
