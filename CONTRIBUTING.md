# Contributing

Wrangler is an open source project and we welcome contributions from you. Thank you!

Below you can find some guidance on how to be most effective when contributing to the project.

## Before getting started

We really appreciate your interest in making a contribution, and we want to make sure that the process is as smooth and transparent as possible! To this end, we note that the Workers team is actively doing development in this repository, and while we consistently strive to communicate status and current thinking around all open issues, there may be times when context surrounding certain items is not up to date. Therefore, **for non-trivial changes, please always engage on the issue or create a discussion or feature request issue first before writing your code.** This will give us opportunity to flag any considerations you should be aware of before you spend time developing. Of course for trivial changes, please feel free to go directly to filing a PR, with the understanding that the PR itself will serve as the place to discuss details of the change.

Thanks so much for helping us improve the [workers-sdk](https://github.com/cloudflare/workers-sdk), and we look forward to your contribution!

## Getting started

### Set up your environment

Wrangler is built and run on the Node.js JavaScript runtime.

- Install the latest LTS version of [Node.js](https://nodejs.dev/) - we recommend using a Node version manager like [nvm](https://github.com/nvm-sh/nvm).
- Install a code editor - we recommend using [VS Code](https://code.visualstudio.com/).
  - When opening the project in VS Code for the first time, it will prompt you to install the [recommended VS Code extensions](https://code.visualstudio.com/docs/editor/extension-marketplace#:~:text=install%20the%20recommended%20extensions) for the project.
- Install the [git](https://git-scm.com/) version control tool.

### Fork and clone this repository

Any contributions you make will be via [Pull Requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) on [GitHub](https://github.com/) developed in a local git repository and pushed to your own fork of the repository.

- Ensure you have [created an account](https://docs.github.com/en/get-started/onboarding/getting-started-with-your-github-account) on GitHub.
- [Create your own fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) of [this repository](https://github.com/cloudflare/workers-sdk).
- Clone your fork to your local machine
  ```sh
  > git clone https://github.com/<your-github-username>/workers-sdk
  > cd workers-sdk
  ```
  You can see that your fork is setup as the `origin` remote repository.
  Any changes you wish to make should be in a local branch that is then pushed to this origin remote.
  ```sh
  > git remote -v
  origin	https://github.com/<your-github-username>/workers-sdk (fetch)
  origin	https://github.com/<your-github-username>/workers-sdk (push)
  ```
- Add `cloudflare/workers-sdk` as the `upstream` remote repository.
  ```sh
  > git remote add upstream https://github.com/cloudflare/workers-sdk
  > git remote -v
  origin	https://github.com/<your-github-username>/workers-sdk (fetch)
  origin	https://github.com/<your-github-username>/workers-sdk (push)
  upstream	https://github.com/cloudflare/workers-sdk (fetch)
  upstream	https://github.com/cloudflare/workers-sdk (push)
  ```
- You should regularly pull from the `main` branch of the `upstream` repository to keep up to date with the latest changes to the project.
  ```sh
  > git switch main
  > git pull upstream main
  From https://github.com/cloudflare/workers-sdk
  * branch            main       -> FETCH_HEAD
  Already up to date.
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
  > cd workers-sdk
  > pnpm install
  ```

## Building and running

Workspaces in this project are mostly written in [TypeScript](https://www.typescriptlang.org/) and compiled, by [esbuild](https://github.com/evanw/esbuild), into JavaScript bundles for distribution.

- Run a distributable for a specific workspace (e.g. wrangler)
  ```sh
  > pnpm run --filter wrangler start
  ```
- Build a distributable for a specific workspace(e.g. wrangler)
  ```sh
  > pnpm run build --filter wrangler
  ```

## Checking the code

The code in the repository is checked for type checking, formatting, linting and testing errors.

- Run all checks in all the workspaces
  ```sh
  > pnpm run check
  ```

When doing normal development you may want to run these checks individually.

### Type Checking

The code is checked for type errors by [TypeScript](https://www.typescriptlang.org/).

- Type check all the code in the repository
  ```sh
  > pnpm run check:type
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
  > pnpm run check:lint
  ```
- The repository has a recommended VS Code plugin to run ESLint checks while editing source code, providing immediate feedback.

### Formatting

The code is checked for formatting errors by [Prettier](https://prettier.io/).

- Run the formatting checks
  ```sh
  > pnpm run check:format
  ```
- The repository has a recommended VS Code plugin to run Prettier checks, and to automatically format using Prettier, while editing source code, providing immediate feedback.

### Testing

Tests in a workspace are executed, by [Vitest](https://vitest.dev/), which is configured to automatically compile and bundle the TypeScript before running the tests.

- Run the tests for all the workspaces
  ```sh
  > pnpm run test
  ```
- Run the tests for a specific workspace (e.g. wrangler)
  ```sh
  > pnpm run test --filter wrangler
  ```
- Watch the files in a specific workspace (e.g. wrangler), and run the tests when anything changes
  ```sh
  > pnpm run --filter wrangler test:watch
  ```
  This will also run all the tests in a single process (rather than in parallel shards) and will increase the test-timeout to 50 seconds, which is helpful when debugging.

## Steps For Making Changes

Every change you make should be stored in a [git commit](https://github.com/git-guides/git-commit).
Changes should be committed to a new local branch, which then gets pushed to your fork of the repository on GitHub.

- Ensure your `main` branch is up to date
  ```sh
  > git switch main
  > git pull upstream main
  ```
- Create a new branch, based off the `main` branch
  ```sh
  > git checkout -b <new-branch-name> main
  ```
- Stage files to include in a commit
  - Use [VS Code](https://code.visualstudio.com/docs/editor/versioncontrol#_git-support)
  - Or add and commit files via the command line
  ```sh
  > git add <paths-to-changes-files>
  > git commit
  ```
- Push changes to your fork
  ```sh
  git push -u origin <new-branch-name>
  ```
- Once you are happy with your changes, create a Pull Request on GitHub
- The format for Pull Request titles is `[package name] description`, where the package name should indicate which package of the `workers-sdk` monorepo your PR pertains to (e.g. `wrangler`/`pages-shared`/`wrangler-devtools`), and the description should be a succinct summary of the change you're making.
- GitHub will insert a template for the body of your Pull Request—it's important to carefully fill out all the fields, giving as much detail as possible to reviewers.

## PR Review

PR review is a critical and required step in the process for landing changes. This is an opportunity to catch potential issues, improve the quality of the work, celebrate good design, and learn from each other.

As a reviewer, it's important to be thoughtful about the proposed changes and communicate any feedback. Examples of PR reviews that the community has identified as particularly high-caliber are labeled with the `highlight pr review` label. Please feel empowered to use these as a learning resource.

## PR Tests

Every PR should include tests for the functionality that's being added. Most changes will be to [Wrangler](packages/wrangler/src/__tests__) (using Vitest), [Miniflare](packages/miniflare/test) (using Ava), or [C3](packages/create-cloudflare/src/__tests__) (using Vitest), and should include unit tests within the testing harness of those packages.

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

When you open a PR to the `workers-sdk` repo, you should expect several checks to run in CI. For most PRs (except for those which trigger the **C3 E2E (Quarantine)** Action), every check should pass (although some will be skipped).

A summary of this repositories actions can be found [here](.github/workflows/README.md)

## Running e2e tests locally

To run the e2e tests locally, you'll need a Cloudflare API Token and run:

```sh
$ WRANGLER="node ~/path/to/workers-sdk/packages/wrangler/wrangler-dist/cli.js" CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_TESTING_ACCOUNT_ID CLOUDFLARE_API_TOKEN=$CLOUDFLARE_TESTING_API_TOKEN pnpm run test:e2e
```

You may optionally want to append a filename pattern to limit which e2e tests are run. Also you may want to set `--bail=n` to limit the number of fails tests to show the error before the rest of the tests finish running and to limit the noise in that output:

```sh
$ WRANGLER="node ~/path/to/workers-sdk/packages/wrangler/wrangler-dist/cli.js" CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_TESTING_ACCOUNT_ID CLOUDFLARE_API_TOKEN=$CLOUDFLARE_TESTING_API_TOKEN pnpm run test:e2e [file-pattern] --bail=1
```

### Creating an API Token

1. Go to ["My Profile" > "User API Tokens"](https://dash.cloudflare.com/profile/api-tokens)
1. Click "Create API Token"
1. Use the "Edit Cloudflare Workers" template
1. Set "Account Resources" to "Include" "DevProd Testing" (you can use any account you have access to)
1. Set "Zone Resources" to "All zones from an account" and the same account as above
1. Click "Continue to summary"
1. Verify your token works by running the curl command provided
1. Set the environment variables in your terminal or in your profile file (e.g. ~/.zshrc, ~/.bashrc, ~/.profile, etc):

```sh
export CLOUDFLARE_TESTING_ACCOUNT_ID="<Account ID for the token you just created>"
export CLOUDFLARE_TESTING_API_TOKEN="<Token you just created>"
```

Note: Workers created in the e2e tests that fail might not always be cleaned up (deleted). Internal users with access to the "DevProd Testing" account can rely on an automated job to clean up the Workers based on the format of the name. If you use another account, please be aware you may want to manually delete the Workers yourself.

## Changesets

Every non-trivial change to the project - those that should appear in the changelog - must be captured in a "changeset".
We use the [`changesets`](https://github.com/changesets/changesets/blob/main/README.md) tool for creating changesets, publishing versions and updating the changelog.

- Create a changeset for the current change.
  ```sh
  > npx changeset
  ```
- Select which workspaces are affected by the change and whether the version requires a major, minor or patch release.
- Update the generated changeset with a description of the change.
- Include the generate changeset in the current commit.
  ```sh
  > git add ./changeset/*.md
  ```

### Changeset message format

Each changeset is a file that describes the change being merged. This file is used to generate the changelog when the changes are released.

To help maintain consistency in the changelog, changesets should have the following format:

```
<TYPE>: <TITLE>

<BODY>

[BREAKING CHANGES <BREAKING_CHANGE_NOTES>]
```

- `TYPE` should be a single word describing the "type" of the change. For example, one of `feature`, `fix`, `refactor`, `docs` or `chore`.
- `TITLE` should be a single sentence containing an imperative description of the change.
- `BODY` should be one or more paragraphs that go into more detail about the reason for the change and anything notable about the approach taken.
- `BREAKING_CHANGE_NOTES` (optional) should be one or more paragraphs describing how this change breaks current usage and how to migrate to the new usage.

### Changeset file example

The generated changeset file will contain the package name and type of change (eg. `patch`, `minor`, or `major`), followed by our changeset format described above.

Here's an example of a `patch` to the `wrangler` package, which provides a `fix`:

```
---
"wrangler": patch
---

fix: replace the word "publish" with "deploy" everywhere.

We should be consistent with the word that describes how we get a worker to the edge. The command is `deploy`, so let's use that everywhere.
```

### Types of changes

We use the following guidelines to determine the kind of change for a PR:

- Bugfixes and experimental features are considered to be 'patch' changes. Be sure to log warnings when experimental features are used.
- New stable features and new deprecation warnings for future breaking changes are considered 'minor' changes. These changes shouldn't break existing code, but the deprecation warnings should suggest alternate solutions to not trigger the warning.
- Breaking changes are considered to be 'major' changes. These are usually when deprecations take effect, or functional breaking behaviour is added with relevant logs (either as errors or warnings.)

### Styleguide

When contributing to Wrangler, please refer to the [`STYLEGUIDE.md file`](https://github.com/STYLEGUIDE.md) file where possible to help maintain consistent patterns throughout Wrangler.

## Releases

We generally cut Wrangler releases at the start of each week. If you need a release cut outside of the regular cadence, please reach out to the [@cloudflare/wrangler-admins](https://github.com/orgs/cloudflare/teams/wrangler-admins) team.
