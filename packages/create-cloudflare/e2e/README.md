# C3 E2E tests

This directory contains the e2e tests and helpers for C3.

## Running tests locally

There are three groups of tests:

- CLI - general tests against the C3 CLI tool, such as interactive prompts
- Workers - tests of the non-framework C3 templates such as `hello-world-durable-object-with-assets-ts`.
- Frameworks - tests of the framework C3 templates, such as `astro:workers`, `qwik:pages`, etc.

- To run all the tests locally you can do run the following from the root of the monorepo:

  ```bash
  pnpm test:e2e -F create-cloudflare
  ```

  This command will actually run the `test:e2e` turbo task in the `create-cloudflare` package, which will also ensure that any dependencies have been built correctly first.

- To run just one group of tests (pass the group name to underlying command):

  ```bash
  pnpm test:e2e -F create-cloudflare -- workers
  ```

  You can choose from `cli`, `workers` or `frameworks`.

The tests that run can be controlled by combining any of the following environment variables:

- `E2E_EXPERIMENTAL` - whether to run the tests in experimental mode - without this variable only non-experimental tests are run.
- `E2E_TEST_PM` + `E2E_TEST_PM_VERSION` - which package manager to simulate in the tests - without these variables the tests simulate `pnpm`.
- `E2E_RUN_DEPLOY_TESTS` - whether to ask C3 to deploy generated projects and run tests against the deployed version - if this is not set to `"true"`, generated projects are only tested locally.
- `CLOUDFLARE_API_TOKEN` - the API token to use in tests that connect to Cloudflare - without this variable tests that require Cloudflare access are skipped.
- `E2E_FRAMEWORK_SHARD` - optional framework case shard in the form `index/count`, with a one-based index. Invalid values fail the run. Without it, all matching cases are collected, including skipped cases.
- `E2E_TEST_RETRIES` - optional non-negative integer override for framework whole-test retries. Framework tests retain one whole-test retry because they exercise external registries, generators, and runtime startup. Cases can override this allowance in `test-config.ts`. Set this to `0` when investigating a failure or measuring first-attempt reliability. Readiness polling within each attempt is unchanged.

### Running a framework shard

All framework cases live in one file, so Vitest's file sharding cannot divide this suite. CI runs three case shards per normal package-manager entry and two shards for experimental pnpm. Each runner retains Vitest's default limit of five concurrent tests.

To reproduce a shard locally, run:

```bash
E2E_FRAMEWORK_SHARD=1/3 pnpm test:e2e -F create-cloudflare -- frameworks
```

Cases are sorted by their full names and distributed round-robin after applying the framework filter and excluding quarantined or unsupported cases. New frameworks and variants are assigned automatically. Use the same package manager, package-manager version, experimental mode, filter, and shard count as CI to reproduce its selection.

The existing required framework checks wait for every framework shard. Failed, cancelled, or skipped shard jobs fail these checks; deliberately skipped test steps still succeed when framework coverage is not requested.

CI publishes per-attempt logs, Vitest's `results.json`, Turbo summaries, and a retry report. The reported Vitest test duration includes waiting for a concurrency slot, hooks, and all attempts, so use the job/Turbo task duration to measure the critical path. Cached test replays are excluded from retry reports.

Treat a recovered attempt as evidence of a reliability problem, even when CI passes. Keep the single retry while addressing the cause; reduce an allowance only after repeated fresh runs support doing so. A repeatable regression should fail the check, and another attempt should not be used to hide it.

Each attempt shares an absolute package-manager cache across its child processes, outside the generated project. This prevents C3's Git initialization from committing cache contents while isolating concurrent installs. The fixture removes both the project and its cache after the attempt. Wrangler's test configuration uses an automatically assigned inspector port to avoid collisions between concurrent preview sessions.

### Running in experimental mode

C3 can be run in experimental mode, by passing `--experimental` to it as a CLI argument. By default the tests will run in non-experimental mode.
To run the tests in experimental mode, simply pass `E2E_EXPERIMENTAL=true` as an environment variable.

For example, to run the "cli" group in experimental mode:

```bash
E2E_EXPERIMENTAL=true pnpm test:e2e -F create-cloudflare -- cli
```

> This experimental environment variable can be combined with the package manager environment variables below.

### Running against different package managers

C3 supports running sub-commands and installs using a range of package managers. By default the tests will run agains `pnpm`.
To run the tests using a different package manager, simply pass `E2E_TEST_PM` and `E2E_TEST_PM_VERSION` as environment variables.

For example, to run the "workers" group using yarn@1.22.22.

```bash
E2E_TEST_PM=yarn E2E_TEST_PM_VERSION=1.22.22 pnpm test:e2e -F create-cloudflare -- workers
```

> These package manager environment variables can be combined with the experimental environment variable above.

### Running Workers templates individually

To run the e2e tests against a specific Worker template (or group of Worker template variants), provide the `E2E_WORKER_TEMPLATE_TO_TEST` environment variable.

Worker template names and their variants are delimited by colons (`:`).
If no colon is specified then all variants will be run for the matching template name.

For example to only run the python version of the `hello-world-durable-objects` template:

```bash
E2E_WORKER_TEMPLATE_TO_TEST=hello-world-durable-object:python pnpm test:e2e -F create-cloudflare -- workers
```

To run all the `hello-world-with-assets` variants (`js`, `python`, `ts`):

```bash
E2E_WORKER_TEMPLATE_TO_TEST=hello-world-with-assets pnpm test:e2e -F create-cloudflare -- workers
```

### Running Web frameworks templates individually

To run the e2e tests against a specific Web framework (or group of Worker template variants), provide the `E2E_FRAMEWORK_TEMPLATE_TO_TEST` environment variable.

Framework templates and their variants (`pages` or `workers`) are delimited by colons (`:`).
If no colon is specified in the filter then all variants will be run for the matching template.

For example to only run the `workers` version of the `react-router` framework:

```bash
E2E_FRAMEWORK_TEMPLATE_TO_TEST=react-router:workers pnpm test:e2e -F create-cloudflare -- frameworks
```

To run all the `qwik` framework variants (`pages`, `workers`):

```bash
E2E_FRAMEWORK_TEMPLATE_TO_TEST=qwik pnpm test:e2e -F create-cloudflare -- frameworks
```
