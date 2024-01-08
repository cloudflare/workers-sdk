# Cloudflare Workers – Templates & Examples

Cloudflare Workers make it possible to write Javascript which runs on Cloudflare’s network around the world. Using Workers you can build services which run exceptionally close to your users. You can also intercept any request, which would ordinarily travel through Cloudflare to your origin, and modify it in any way you need. Workers can make requests to arbitrary resources on the Internet, perform cryptography using the WebCrypto API, or do nearly anything you'd typically configure a CDN to accomplish.

This repository contains a collection of starter templates and examples of how Workers can be used to accomplish common tasks. **You are welcome to use, modify, and extend this code!** If you have an additional example you think would be valuable, please submit a pull request.

Questions about Workers? Please join the [Cloudflare Developers Discord](https://workers.community/)!

## Usage

There are a few ways to quickly jumpstart your next project using one of the templates found within this repository:

1. **Local development, via CLI quickstart utility**

   We recommend using the `npx wrangler generate [folder-name] [template-name]` command to create new projects with templates.

   To create a `my-project` directory using the [`worker-typescript`](/worker-typescript) template, you would run the following command:

   `npx wrangler generate my-project worker-typescript`

   Each template also comes with explicit installation and setup instructions in the README.

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
