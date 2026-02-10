# Contributing

Wrangler is an open-source project and we welcome contributions from you. Thank you!

Below you can find some guidance on how to be most effective when contributing to the project.

## tl;dr for contributing to Wrangler

Useful commands for developing Wrangler (all commands below should be run in the project root):

- `pnpm i; pnpm build` will build everything in workers-sdk.
- `pnpm dev -F wrangler` will watch and build changes while you develop. Fixtures use the build output from this, and are useful for messing around during dev (`fixtures/worker-ts` is a useful blank slate).

Before committing/submitting a PR:

- Add [tests](#pr-tests). `pnpm test -F wrangler` will run Wrangler's unit tests. You can filter tests: e.g. `pnpm test -F wrangler "containers"`.
- Run `pnpm check` for typechecking and linting.
- Add a [changeset](#changesets) with `pnpm changeset`.
- Don’t squash your commits after a review.

## Before getting started

We really appreciate your interest in making a contribution, and we want to make sure that the process is as smooth and transparent as possible! To this end, we note that the Workers team is actively doing development in this repository, and while we consistently strive to communicate status and current thinking around all open issues, there may be times when context surrounding certain items is not up to date. Therefore, **for non-trivial changes, please always engage on the issue or create a discussion or feature request issue first before writing your code.** This will give us opportunity to flag any considerations you should be aware of before you spend time developing. Of course, for trivial changes, please feel free to go directly to filing a PR, with the understanding that the PR itself will serve as the place to discuss details of the change.

Thanks so much for helping us improve the [workers-sdk](https://github.com/cloudflare/workers-sdk), and we look forward to your contribution!

## Getting started

### Set up your environment

Wrangler is built and run on the Node.js JavaScript runtime.

- Install the latest LTS version of [Node.js](https://nodejs.dev/) - we recommend using a Node version manager like [nvm](https://github.com/nvm-sh/nvm).
- Install a code editor - we recommend using [VS Code](https://code.visualstudio.com/).
  - When opening the project in VS Code for the first time, it will prompt you to install the [recommended VS Code extensions](https://code.visualstudio.com/docs/editor/extension-marketplace#:~:text=install%20the%20recommended%20extensions) for the project.
- Install the [git](https://git-scm.com/) version control tool.

### Fork and clone this repository

#### For External Contributors

Any contributions you make will be via [Pull Requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) on [GitHub](https://github.com/) developed in a local git repository and pushed to your own fork of the repository.

- Ensure you have [created an account](https://docs.github.com/en/get-started/onboarding/getting-started-with-your-github-account) on GitHub.
- [Create your own fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) of [this repository](https://github.com/cloudflare/workers-sdk).
- Clone your fork to your local machine

  ```sh
  git clone https://github.com/<your-github-username>/workers-sdk
  cd workers-sdk
  ```

  You can see that your fork is setup as the `origin` remote repository.
  Any changes you wish to make should be in a local branch that is then pushed to this origin remote.

  ```sh
  git remote -v
  origin	https://github.com/<your-github-username>/workers-sdk (fetch)
  origin	https://github.com/<your-github-username>/workers-sdk (push)
  ```

- Add `cloudflare/workers-sdk` as the `upstream` remote repository.

  ```sh
  git remote add upstream https://github.com/cloudflare/workers-sdk
  git remote -v
  origin	https://github.com/<your-github-username>/workers-sdk (fetch)
  origin	https://github.com/<your-github-username>/workers-sdk (push)
  upstream	https://github.com/cloudflare/workers-sdk (fetch)
  upstream	https://github.com/cloudflare/workers-sdk (push)
  ```

- You should regularly pull from the `main` branch of the `upstream` repository to keep up to date with the latest changes to the project.

  ```sh
  git switch main
  git pull upstream main
  From https://github.com/cloudflare/workers-sdk
  * branch            main       -> FETCH_HEAD
  Already up to date.
  ```

#### For Cloudflare Employees

If you are a Cloudflare employee, you do not need to fork the repository - instead, you can clone the main repository directly. This allows you to push branches directly to the upstream repository.

If you find that you don't have write access, please reach out to your manager or the Wrangler team internally.

Clone the main repository:

```sh
git clone https://github.com/cloudflare/workers-sdk.git
cd workers-sdk
```

Create new branches directly in the cloned repository and push them to the main repository:

```sh
git checkout -b <new-branch-name>
git push origin <new-branch-name>
```

### Install dependencies

**Warning**
When working on Wrangler, you'll need to satisfy [`workerd`](https://github.com/cloudflare/workerd)'s `libc++1` runtime dependencies:

- On Linux:
  - libc++ (e.g. the package `libc++1` on Debian Bullseye)
- On macOS:
  - The XCode command line tools, which can be installed with xcode-select --install

The Node.js dependencies of the project are managed by the [`pnpm`](https://pnpm.io/) tool.

This repository is setup as a [mono-repo](https://pnpm.io/workspaces) of workspaces. The workspaces are stored in the [`packages`](https://github.com/cloudflare/workers-sdk/tree/main/packages) directory.

While each workspace has its own dependencies, you install the dependencies using `pnpm` at the root of the project.

> If you haven't used `pnpm` before, you can install it with `npm install -g pnpm`

- Install all the dependencies

  ```sh
  cd workers-sdk
  pnpm install
  ```

## Building and running

Workspaces in this project are mostly written in [TypeScript](https://www.typescriptlang.org/) and compiled, by [esbuild](https://github.com/evanw/esbuild), into JavaScript bundles for distribution.

- Run a distributable for a specific workspace (e.g. wrangler)

  ```sh
  pnpm run --filter wrangler start
  ```

- Build a distributable for a specific workspace (e.g. wrangler)

  ```sh
  pnpm run build --filter wrangler
  ```

## Checking the code

The code in the repository is checked for type checking, formatting, linting and testing errors.

- Run all checks in all the workspaces

  ```sh
  pnpm run check
  ```

When doing normal development, you may want to run these checks individually.

### Type Checking

The code is checked for type errors by [TypeScript](https://www.typescriptlang.org/).

- Type check all the code in the repository

  ```sh
  pnpm run check:type
  ```

- VS Code will also run type-checking while editing source code, providing immediate feedback.

#### Changing TypeScript Version in VS Code's Command Palette

For TypeScript to work properly in the Monorepo the version used in VSCode must be the project's current TypeScript version, follow these steps:

1. Open the project in VSCode.

2. Press `Ctrl + Shift + P` (or `Cmd + Shift + P` on macOS) to open the command palette.

3. In the command palette, type "Select TypeScript Version" and select the command with the same name that appears in the list.

4. A submenu will appear with a list of available TypeScript versions. Choose the desired version you want to use for this project. If you have multiple versions installed, they will be listed here.

   - Selecting "Use Workspace Version" will use the version of TypeScript installed in the project's `node_modules` directory.

5. After selecting the TypeScript version, VSCode will reload the workspace using the chosen version.

Now you have successfully switched the TypeScript version used within the project via the command palette in VSCode.
Remember that this change is specific to the current project and will not affect other projects or the default TypeScript version used by VSCode.

### Linting

The code is checked for linting errors by [ESLint](https://eslint.org/).

- Run the linting checks

  ```sh
  pnpm run check:lint
  ```

- The repository has a recommended VS Code plugin to run ESLint checks while editing source code, providing immediate feedback.

### Formatting

The code is checked for formatting errors by [Prettier](https://prettier.io/).

- Run the formatting checks

  ```sh
  pnpm run check:format
  ```

- The repository has a recommended VS Code plugin to run Prettier checks, and to automatically format using Prettier, while editing source code, providing immediate feedback
- Use the following command to run prettier on the codebase

  ```sh
  pnpm run prettify
  ```

### Testing

Tests in a workspace are executed, by [Vitest](https://vitest.dev/), which is configured to automatically compile and bundle the TypeScript before running the tests.

- If you have recently rebased on `main` then make sure you have installed any new dependencies

  ```sh
  pnpm i
  ```

- Run the tests for all the workspaces

  ```sh
  pnpm run test
  ```

  :::note
  Cloudflare employees may need to turn off WARP for the first time they run the Miniflare tests so that it can request and cache the CF properties without getting the following error.

  ```plain
  failed: TLS peer's certificate is not trusted; reason = self signed certificate in certificate chain
  ```

  After this request is cached you can run tests with WARP turned on, no problem.
  :::

- Run the tests for a specific workspace (e.g. wrangler)

  ```sh
  pnpm run test --filter wrangler
  ```

- Watch the files in a specific workspace (e.g. wrangler), and run the tests when anything changes

  ```sh
  pnpm run --filter wrangler test:watch
  ```

  This will also run all the tests in a single process (rather than in parallel shards) and will increase the test-timeout to 50 seconds, which is helpful when debugging.

## Steps For Making Changes

Every change you make should be stored in a [git commit](https://github.com/git-guides/git-commit).
Changes should be committed to a new local branch, which then gets pushed to your fork of the repository on GitHub.

- Ensure your `main` branch is up to date

  ```sh
  git switch main
  git pull upstream main
  ```

- Create a new branch, based off the `main` branch

  ```sh
  git checkout -b <new-branch-name> main
  ```

- Stage files to include in a commit

  - Use [VS Code](https://code.visualstudio.com/docs/editor/versioncontrol#_git-support)
  - Or add and commit files via the command line

  ```sh
  git add <paths-to-changes-files>
  git commit
  ```

- Push changes to your fork

  ```sh
  git push -u origin <new-branch-name>
  ```

- Once you are happy with your changes, create a Pull Request on GitHub
- The format for Pull Request titles is `[package name] description`, where the package name should indicate which package of the `workers-sdk` monorepo your PR pertains to (e.g. `wrangler`/`pages-shared`/`chrome-devtools-patches`), and the description should be a succinct summary of the change you're making.
- GitHub will insert a template for the body of your Pull Request—it's important to carefully fill out all the fields, giving as much detail as possible to reviewers.

### Git Hygiene

Making sure your branch follows our recommendations for git will help ensure your PR is reviewed & released as quickly as possible:

- When opening a PR (before the first review), try and make sure your git commit history is clean, and clearly describes the changes you want to make.
  - For instance, here's an example of a PR where the commit history is quite messy, and doesn't help reviewers: <https://github.com/cloudflare/workers-sdk/pull/2409/commits>
  - And here's an example of where this has been done well: <https://github.com/cloudflare/workers-sdk/pull/4795/commits>
- Once your PR has been reviewed, when addressing feedback try not to modify already reviewed commits with force pushes. This slows down the review process and makes it hard to keep track of what changes have been made. Instead, add additional commits to your PR to address any feedback (`git commit --fixup` is a helpful tool here).
- When merging your PR into `main`, `workers-sdk` enforces squash merges. As such, please try and make sure that the commit message associated with the merge clearly describes the entire change your PR makes.

## PR Review

PR review is a critical and required step in the process for landing changes. This is an opportunity to catch potential issues, improve the quality of the work, celebrate good design, and learn from each other. As a reviewer, it's important to be thoughtful about the proposed changes and communicate any feedback.

## PR Previews

Every PR will have an associated pre-release build for all releasable packages within the repository, powered by [pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new). You can find links to prereleases for each package in a comment automatically posted by GitHub Actions on each opened PR ([for example](https://github.com/cloudflare/workers-sdk/pull/9492#issuecomment-2943757675)).

It's also possible to generate preview builds for the applications in the repository. These aren't generated automatically because they're pretty slow CI jobs, but you can trigger preview builds by adding one of the following labels to your PR:

- `preview:chrome-devtools-patches` for deploying [chrome-devtools-patches](packages/chrome-devtools-patches)
- `preview:workers-playground` for deploying [workers-playground](packages/workers-playground)
- `preview:quick-edit` for deploying [quick-edit](packages/quick-edit)

Once built, you can find the preview link for these applications in the [Deploy Pages Previews](.github/workflows/deploy-pages-previews.yml) action output

## PR Tests

Every PR should include tests for the functionality that's being added. Most changes will be to [Wrangler](packages/wrangler/src/__tests__) (using Vitest), [Miniflare](packages/miniflare/test) (using Ava), or [C3](packages/create-cloudflare/src/__tests__) (using Vitest), and should include unit tests within the testing harness of those packages. For documentation on how these testing frameworks work, see:

- Vitest: <https://vitest.dev/guide>
- Ava: <https://github.com/avajs/ava?tab=readme-ov-file#documentation>

If your PR includes functionality that's difficult to unit test, you can add a fixture test by creating a new package in the `fixtures/` folder. This allows for adding a test that requires a specific filesystem or worker setup (for instance, `fixtures/no-bundle-import` tests the interaction of Wrangler with a specific set of JS, WASM, text, and binary modules on the filesystem). When adding a fixture test, include a `vitest.config.mts` file within the new package, which will ensure it's run as part of the `workers-sdk` CI. You should merge your own configuration with the default config from the root of the repo.

A good default example is the following:

```ts
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      // config overrides
    }
  })
});
```

If you need to test the interaction of Wrangler with a real Cloudflare account, you can add an E2E test within the `packages/wrangler/e2e` folder. This lets you add a test for functionality that requires real credentials (i.e. testing whether a worker deployed from Wrangler can be accessed over the internet).

A summary of this repositories actions can be found [in the `.github/workflows` folder](.github/workflows/README.md)

## Running E2E tests locally

A large number of Wrangler, C3 & Vite's E2E tests don't require any authentication, and can be run with no Cloudflare account credentials. These can be run as follows, optionally providing [`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables.](#creating-an-api-token):

- **Vite:** `pnpm test:e2e -F @cloudflare/vite-plugin`

  You may optionally want to append a filename pattern to limit which e2e tests are run. Also you may want to set `--bail=n` to limit the number of fails tests to show the error before the rest of the tests finish running and to limit the noise in that output:

  ```sh
  pnpm test:e2e -F @cloudflare/vite-plugin [file-pattern] --bail=1
  ```

- **C3:** `pnpm test:e2e -F create-cloudflare`

  See [C3 E2E tests README](packages/create-cloudflare/e2e/README.md) for more information.

- **Wrangler:** `pnpm test:e2e -F wrangler` or `pnpm test:e2e:wrangler`

  See [Wrangler E2E tests README](packages/wrangler/e2e/README.md) for more information.

### Creating an API Token

If you want to run the E2E tests that access the Cloudflare API (e.g. for testing Worker deployment and interaction with bindings), you can create an API token for running the tests:

1. Go to ["My Profile" > "User API Tokens"](https://dash.cloudflare.com/profile/api-tokens)
1. Click "Create Token"
1. Use the "Edit Cloudflare Workers" template
1. Set "Account Resources" to "Include" the account you want to use for running the test
   (for internal and CI use, this needs to be the "DevProd Testing" account)
1. No "Zone Resources" are required for general use (for internal and CI use, this needs to be set to "All Zones")
1. Click "Continue to summary"
1. Verify your token works by running the curl command provided

Once you've created the token, you can use it when running E2E tests to test against the API:

```sh
# Vite
CLOUDFLARE_ACCOUNT_ID="<Account ID for the token you just created>" CLOUDFLARE_API_TOKEN="<Token you just created>" pnpm test:e2e -F @cloudflare/vite-plugin

# C3
CLOUDFLARE_ACCOUNT_ID="<Account ID for the token you just created>" CLOUDFLARE_API_TOKEN="<Token you just created>" pnpm test:e2e -F @create-cloudflare

# Wrangler
CLOUDFLARE_ACCOUNT_ID="<Account ID for the token you just created>" CLOUDFLARE_API_TOKEN="<Token you just created>" pnpm test:e2e:wrangler
```

> [!NOTE]
> Workers and other resources created in the E2E tests might not always be cleaned up. Internal users with access to the "DevProd Testing" account can rely on an automated job to clean up the Workers and other resources, but if you use another account, please be aware you may want to manually delete the Workers and other resources yourself.

## Managing Package Dependencies

Packages in this monorepo should bundle their dependencies into the distributable code rather than leaving them as runtime `dependencies` that get installed by downstream users. This prevents dependency chain poisoning where a transitive dependency could introduce unexpected or malicious code.

### The Rule

- **Bundle dependencies**: Most dependencies should be listed in `devDependencies` and bundled into the package output by esbuild/tsup/etc.
- **External dependencies**: Only dependencies that _cannot_ be bundled should be listed in `dependencies`. These must be explicitly declared with documentation explaining why.

### Why This Matters

When users install one of our packages (e.g., `wrangler`), npm/pnpm will also install everything listed in `dependencies`. If one of those dependencies has unpinned transitive dependencies, a malicious actor could publish a compromised version that gets pulled into user installations. By bundling our dependencies, we control exactly what code ships.

### Adding a New External Dependency

If you need to add a dependency that cannot be bundled (native binaries, WASM modules, packages that must be resolved at runtime, etc.):

1. **Add to `dependencies`** in `package.json` with a pinned version
2. **Add to `EXTERNAL_DEPENDENCIES`** in `scripts/deps.ts` with a comment explaining why it can't be bundled
3. **Run `pnpm check:package-deps`** to verify the allowlist is correct

Example `scripts/deps.ts`:

```typescript
export const EXTERNAL_DEPENDENCIES = [
	// Native binary - cannot be bundled
	"workerd",

	// WASM module that blows up when bundled
	"blake3-wasm",

	// Must be resolved at runtime when bundling user's worker code
	"esbuild",
];
```

### Valid Reasons for External Dependencies

- **Native binaries**: Packages like `workerd` or `sharp` contain platform-specific binaries
- **WASM modules**: Some WASM packages don't bundle correctly
- **Runtime resolution**: Packages like `esbuild` or `unenv` that need to be resolved when bundling user code
- **Peer dependencies**: Packages the user is expected to provide (e.g., `react`, `vite`)

## Changesets

Every non-trivial change to the project - those that should appear in the changelog - must be captured in a "changeset".

See the [.changeset/README.md](.changeset/README.md) for detailed guidelines on:

- Creating changesets
- Choosing version types (patch/minor/major)
- Writing good changeset descriptions
- Formatting rules

Quick start:

```sh
pnpm changeset
git add .changeset/*.md
```

### Styleguide

When contributing to Wrangler, please refer to the [`STYLEGUIDE.md file`](STYLEGUIDE.md) file where possible to help maintain consistent patterns throughout Wrangler.

## Releases

We generally cut Wrangler releases on Tuesday & Thursday each week. If you need a release cut outside of the regular cadence, please reach out to the [@cloudflare/wrangler-admins](https://github.com/orgs/cloudflare/teams/wrangler-admins) team.
