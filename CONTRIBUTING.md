# Contributing

Wrangler2 is an open source project and we welcome contributions from you. Thank you!

Below you can find some guidance on how to be most effective when contributing to the project.

## Getting started

### Set up your environment

Wrangler2 is built and run on the Node.js JavaScript runtime.

- Install the latest LTS version of [Node.js](https://nodejs.dev/) - we recommend using a Node version manager like [nvm](https://github.com/nvm-sh/nvm).
- Install a code editor - we recommend using [VS Code](https://code.visualstudio.com/).
  - When opening the project in VS Code for the first time, it will prompt you to install the [recommended VS Code extensions](https://code.visualstudio.com/docs/editor/extension-marketplace#:~:text=install%20the%20recommended%20extensions) for the project.
- Install the [git](https://git-scm.com/) version control tool.

### Fork and clone this repository

Any contributions you make will be via [Pull Requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) on [GitHub](https://github.com/) developed in a local git repository and pushed to your own fork of the repository.

- Ensure you have [created an account](https://docs.github.com/en/get-started/onboarding/getting-started-with-your-github-account) on GitHub.
- [Create your own fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) of [this repository](https://github.com/cloudflare/wrangler2).
- Clone your fork to your local machine
  ```sh
  > git clone https://github.com/<your-github-username>/wrangler2
  > cd wrangler2
  ```
  You can see that your fork is setup as the `origin` remote repository.
  Any changes you wish to make should be in a local branch that is then pushed to this origin remote.
  ```sh
  > git remote -v
  origin	https://github.com/<your-github-username>/wrangler2 (fetch)
  origin	https://github.com/<your-github-username>/wrangler2 (push)
  ```
- Add `cloudflare/wrangler2` as the `upstream` remote repository.
  ```sh
  > git remote add upstream https://github.com/cloudflare/wrangler2
  > git remote -v
  origin	https://github.com/<your-github-username>/wrangler2 (fetch)
  origin	https://github.com/<your-github-username>/wrangler2 (push)
  upstream	https://github.com/cloudflare/wrangler2 (fetch)
  upstream	https://github.com/cloudflare/wrangler2 (push)
  ```
- You should regularly pull from the `main` branch of the `upstream` repository to keep up to date with the latest changes to the project.
  ```sh
  > git switch main
  > git pull upstream main
  From https://github.com/cloudflare/wrangler2
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

The Node.js dependencies of the project are managed by the [`npm`](https://www.npmjs.com/) tool.

This repository is setup as a [mono-repo](https://docs.npmjs.com/cli/v7/using-npm/workspaces) of workspaces. The workspaces are stored in the [`packages`](https://github.com/cloudflare/wrangler2/tree/main/packages) directory.

While each workspace has its own dependencies, you install the dependencies using `npm` at the root of the project.

- Install all the dependencies
  ```sh
  > cd wrangler2
  > npm install
  ```

**Do not run `npm install` in any of the workspaces directly.**

## Building and running

Each wrangler workspace in this project is written in [TypeScript](https://www.typescriptlang.org/) and compiled, by [esbuild](https://github.com/evanw/esbuild), into JavaScript bundles for distribution.

- Run a distributable for a specific workspace (e.g. wrangler)
  ```sh
  > npm start -w wrangler
  ```
- Build a distributable for a specific workspace(e.g. wrangler)
  ```sh
  > npm run build -w wrangler
  ```

## Checking the code

The code in the repository is checked for type checking, formatting, linting and testing errors.

- Run all checks in all the workspaces
  ```sh
  > npm run check
  ```

When doing normal development you may want to run these checks individually.

### Type Checking

The code is checked for type errors by [TypeScript](https://www.typescriptlang.org/).

- Type check all the code in the repository
  ```sh
  > npm run check:type
  ```
- VS Code will also run type-checking while editing source code, providing immediate feedback.

### Linting

The code is checked for linting errors by [ESLint](https://eslint.org/).

- Run the linting checks
  ```sh
  > npm run check:lint
  ```
- The repository has a recommended VS Code plugin to run ESLint checks while editing source code, providing immediate feedback.

### Formatting

The code is checked for formatting errors by [Prettier](https://prettier.io/).

- Run the formatting checks
  ```sh
  > npm run check:format
  ```
- The repository has a recommended VS Code plugin to run Prettier checks, and to automatically format using Prettier, while editing source code, providing immediate feedback.

### Testing

Tests in a workspace are executed, by [Jest](https://jestjs.io/), which is configured to automatically compile and bundle the TypeScript before running the tests.

- Run the tests for all the workspaces
  ```sh
  > npm run test
  ```
- Run the tests for a specific workspace (e.g. wrangler)
  ```sh
  > npm run test -w wrangler
  ```
- Watch the files in a specific workspace (e.g. wrangler), and run the tests when anything changes
  ```sh
  > npm run test-watch -w wrangler
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

fix: replace the word "deploy" with "publish" everywhere.

We should be consistent with the word that describes how we get a worker to the edge. The command is `publish`, so let's use that everywhere.
```

### Types of changes

We use the following guidelines to determine the kind of change for a PR:

- Bugfixes and experimental features are considered to be 'patch' changes. Be sure to log warnings when experimental features are used.
- New stable features and new deprecation warnings for future breaking changes are considered 'minor' changes. These changes shouldn't break existing code, but the deprecation warnings should suggest alternate solutions to not trigger the warning.
- Breaking changes are considered to be 'major' changes. These are usually when deprecations take effect, or functional breaking behaviour is added with relevant logs (either as errors or warnings.)

## Miniflare Development

Wrangler builds upon, and provides a new entry point for, [Miniflare](https://github.com/cloudflare/miniflare), a local Cloudflare Workers simulator. To develop on both Wrangler and Miniflare together, you need to link the two projects, but as of NodeJS `v18.3.0` and NPM `v8.15.0`, relative NPM installs between two workspaces don't work, so you need things to be manual:

Assume you have the two directories checked out right beside each other:

```
❯ ll src
drwxr-xr-x     - user 30 Jun 14:12 src
drwxr-xr-x     - user 26 Jul 17:34 ├── miniflare
drwxr-xr-x     - user 27 Jul 17:51 └── wrangler2
```

> Note: recommend using [exa](https://the.exa.website/) and `alias ll='exa --icons -laTL 1'` for the above output

Inside `packages/wrangler/package.json`, replace:

```
"@miniflare/d1": "^2.x.x",
"@miniflare/core": "^2.x.x",
"@miniflare/durable-objects": "^2.x.x",
"miniflare": "^2.x.x",
```

with

```
"miniflare": "file:../../../miniflare/packages/miniflare",
"@miniflare/d1": "file:../../../miniflare/packages/d1",
"@miniflare/core": "file:../../../miniflare/packages/core",
"@miniflare/durable-objects": "file:../../../miniflare/packages/durable-objects",
```

Then run `npm install` in the root of this monorepo.
