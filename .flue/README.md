# Workers SDK Flue

This private workspace contains the Flue agents used by Workers SDK automation. It targets Cloudflare with Flue v2.0.2 and includes a Cloudflare Computer adapter for future agents that need a durable workspace, shallow Git checkouts, and shell-expressible analysis without provisioning a Container.

## Setup

Install the monorepo dependencies from the repository root:

```sh
pnpm install
```

Build and type-check the Flue workspace:

```sh
pnpm --filter @cloudflare/workers-sdk-flue build
pnpm --filter @cloudflare/workers-sdk-flue check:type
```

Regenerate the Wrangler `Env` types after changing bindings or agents:

```sh
pnpm --filter @cloudflare/workers-sdk-flue cf-typegen
```

Create the ignored `.flue/.env` file with the required local secrets:

```sh
GITHUB_TOKEN=replace-with-a-github-token
GITHUB_WEBHOOK_SECRET=replace-with-a-random-webhook-secret
```

Start the Cloudflare development server:

```sh
pnpm --filter @cloudflare/workers-sdk-flue dev
```

## Cloudflare Computer

The generated `cloudflare-computer@1` sandbox adapter uses a durable, SQLite-backed `Workspace` in each sandbox-enabled agent's Durable Object. Its default execution backend runs just-bash in a Dynamic Worker and exposes Flue's standard file and shell tools plus Computer's typed Git client.

The adapter requires the `LOADER` Worker Loader binding and the `experimental` compatibility flag already configured in `wrangler.jsonc`. Worker Loader is beta-gated. The current `GithubAssistant` does not attach the sandbox; an agent that needs it must call `useSandbox(getComputerSandbox({ loader: env.LOADER }))` and re-export `workspaceHost as cloudflare` from its agent module.

The default Worker shell does not provide native binaries or package managers. Reproduction that requires those capabilities must explicitly use Computer's container backend, Cloudflare Sandbox, GitHub Actions, or another isolated Linux environment.

## GitHub channel

Configure `GITHUB_TOKEN` and `GITHUB_WEBHOOK_SECRET` as secrets on the deployed Worker. `GITHUB_TOKEN` authenticates outbound GitHub API requests.
`GITHUB_WEBHOOK_SECRET` verifies inbound webhook signatures and must match the secret configured in GitHub.

Create a GitHub webhook with these settings:

- Payload URL: `https://<worker-host>/channels/github/webhook`
- Content type: `application/json`
- Secret: the deployed `GITHUB_WEBHOOK_SECRET` value
- Events: **Issue comments** and **Pull request review comments**

The webhook route uses GitHub signature verification. Created comments are dispatched to the `github-assistant` agent, which can reply only to the repository and issue or pull request associated with that verified webhook. The agent is dispatch-only and has no public agent route.

## Planned follow-up pull requests

The remaining triage functionality is intentionally split into focused pull requests:

1. Add `issues.opened` handling and a dispatch-only issue-triage agent. This agent will assess merit and produce one consolidated triage result.
2. Add shared GitHub search and label tools for duplicate detection and the advisory `possible-ai` label.
3. Add one reproduction handoff that can start isolated checkout and test work when issue triage determines it is useful.
4. Add pull-request triage for duplicate changes, changeset analysis, inline review comments, and remote E2E recommendations.
5. Add failed-CI analysis as a focused tool or subagent of pull-request triage.
6. Add deterministic routing for explicit bot mentions in issue and pull-request threads.

GitHub webhooks will trigger the triage agents. Bounded checkout and reproduction work should use shared, sandbox-backed Flue tools. GitHub Actions or Cloudflare Workflows are reserved for native test execution or durable orchestration that should live outside the agent conversation.
