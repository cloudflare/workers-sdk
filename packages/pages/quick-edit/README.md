# VSCode for Web

This package contains Cloudflare's fork VSCode for Web, to support web editing of Workers. This package primarily contains code and setup for _building_ VSCode for web, but it can also be used for development.

## Developing

1. You must switch your NodeJS version to NodeJS 18 (using a tool like nvm). VSCode's build process requires this. For instance, if you use `nvm`, running `nvm use` would be enough to switch to the correct NodeJS version.
2. Run `pnpm install`
3. Run `yarn setup`, which will install dependencies, clone VSCode (currently v1.85.2), apply the patches specified in `./patches`, and symlink the top level packages within `workers-sdk`.
4. Run `pnpm run dev`. This will start various dev servers for VSCode and `quick-edit-extension`. Note, this takes a _long_ time to start up. Expect up to 3 minutes, although reloads will be much faster. You can access the VSCode dev server at `http://localhost:8788`

## Building

Follow steps (1), (2) and (3) from above, and then run `yarn custom:build`

## Deployment

Deployments are managed by Github Actions:

- deploy-pages-previews.yml:
  - Runs on any PR that has the `preview:quick-edit` label.
  - Deploys a preview, which can then be accessed via [https://<SHA>.quick-edit-cny.pages.dev/].
- changesets.yml:
  - Runs when a "Version Packages" PR, containing a changeset that touches this package, is merged to `main`.
  - Deploys this package to production, which can then be accessed via [https://quick-edit-cny.pages.dev/].

## Patching VSCode

If you need to add additional patches to VSCode, ensure you've run `yarn setup`. Then:

1. Make your changes in the checked out VSCode in `vendor/vscode`.
2. Commit your changes with `git commit -m "YOUR MESSAGE" --no-verify` (run this in the `vendor/vscode` directory).
3. Prepare a new series of patches for VSCode with (again, run in the `vendor/vscode` directory) `git format-patch -o ../../packages/quick-edit/patches base`.

## Modifying VSCode settings

If you need to change VSCode's configuration, open the `packages/quick-edit/functions/_middleware.ts` file.

The `WORKBENCH_WEB_CONFIGURATION` object contains VSCode's setup config, but the property `configurationDefaults` is most relevant, since it lets you set defaults for any VSCode settings. The format is exactly the same as VSCode's `settings.json` file.
