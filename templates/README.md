# Cloudflare Workers – Templates & Examples

Cloudflare Workers make it possible to write Javascript which runs on Cloudflare’s network around the world. Using Workers you can build services which run exceptionally close to your users. You can also intercept any request, which would ordinarily travel through Cloudflare to your origin, and modify it in any way you need. Workers can make requests to arbitrary resources on the Internet, perform cryptography using the WebCrypto API, or do nearly anything you'd typically configure a CDN to accomplish.

This repository contains a collection of starter templates and examples of how Workers can be used to accomplish common tasks. **You are welcome to use, modify, and extend this code!** If you have an additional example you think would be valuable, please submit a pull request.

Questions about Workers? Please join the [Cloudflare Developers Discord](https://workers.community/)!

## Usage

There are a few ways to quickly jumpstart your next project using one of the templates found within this repository:

<!-- todo(eidam): is workers.new/<name> still hardcoded or ready for all? -->
<!-- 2. In-browser development, via `workers.new` -->

1. **Local development, via CLI quickstart utility**

   You may use `yarn`, `pnpm`, or `npm` to invoke the [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) package.

   > **Note:** All recent versions of `npm`, `yarn`, and `pnpm` support this feature!

   You may select the name of any subdirectory within this repository to create your project; for example, `worker-typescript` and `examples/fast-google-fonts` are both valid subdirectory names.

   To create a `my-project` directory using the [`worker-typescript`](/worker-typescript) template, you may run one of the following commands:

   > **Note**
   > This package has now been sunsetted! We recommend using the `wrangler generate [name] [template]` command to create new projects with templates.

   ```sh
   $ npm init cloudflare my-project worker-typescript
   # or
   $ yarn create cloudflare my-project worker-typescript
   # or
   $ pnpm create cloudflare my-project worker-typescript
   ```

1. **Local development, via full repository clone**

   You may clone this entire repository and copy the desired subdirectory to your target location:

   ```sh
   # full repository clone
   $ git clone --depth 1 https://github.com/cloudflare/templates

   # copy the "worker-typescript" example to "my-project" directory
   $ cp -rf templates/worker-typescript my-project

   # setup & begin development
   $ cd my-project && npm install && npm run dev
   ```

## Contributing

Please ensure the `test` npm-script passes. Any formatting errors can typically be autofixed by running the `format` npm-script. This is enforced in CI for all pull requests.

If adding a new template, please pick a unique name and aim for simplicity and clarity. Contributions that are meant for Workers must begin with the `worker-` prefix, while those meant for Pages must have the `pages-` prefix.

Also see [Monorepo Contributing Guidelines](../../CONTRIBUTING.md) for more information.

### Code of Conduct

See [CODE OF CONDUCT](../../CODE_OF_CONDUCT.md) for details.

## License

See [APACHE LICENSE](../../LICENSE-MIT) for details.
See [MIT LICENSE](../../LICENSE-APACHE) for details.
