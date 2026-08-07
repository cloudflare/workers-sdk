# Workers SDK Auto Triage Bot

This private [Flue](https://flueframework.com/) application in `packages/auto-triage-bot` hosts agent-powered automation for maintaining the Workers SDK. It connects external events to specialized agents, gives each agent scoped tools and runtime access, and reports results through the originating service.

## Architecture

1. Channels receive events from services such as GitHub.
2. Each channel validates the relevant event data and dispatches a specialized agent.
3. Agents run with the models, tools, and isolated environments required by their workflow.
4. Channel-specific tools report results or perform other narrowly scoped actions in the originating service.

## Current workflows

### GitHub issue reproduction

The initial workflow listens for newly opened GitHub issues, dispatches an `IssueTriage` agent to attempt a reproduction in a Cloudflare Sandbox, and comments once with the outcome.

## Setup

Install the workers-sdk workspace dependencies from the repository root:

```sh
pnpm install
```

Copy `packages/auto-triage-bot/.env.example` to `packages/auto-triage-bot/.env`, then replace the placeholder values required by the current GitHub workflow:

- `GITHUB_TOKEN`: a fine-grained personal access token with read and write access to issues for every repository the bot handles.
- `GITHUB_WEBHOOK_SECRET`: a high-entropy secret shared with the GitHub webhook.

Start the application from the repository root:

```sh
pnpm --filter @cloudflare/workers-sdk-auto-triage dev
```

To enable the issue reproduction workflow, configure a GitHub webhook to use the deployed `/channels/github/webhook` endpoint and subscribe it to issue events.

## Commands

Run these commands from the repository root:

| Command                                                        | Purpose                                              |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm --filter @cloudflare/workers-sdk-auto-triage build`      | Build the Worker and agent bundles                   |
| `pnpm --filter @cloudflare/workers-sdk-auto-triage cf-typegen` | Regenerate `worker-configuration.d.ts` after a build |
| `pnpm --filter @cloudflare/workers-sdk-auto-triage check:type` | Type-check the package                               |
| `pnpm --filter @cloudflare/workers-sdk-auto-triage deploy`     | Deploy the application with Wrangler                 |
| `pnpm --filter @cloudflare/workers-sdk-auto-triage dev`        | Start local development                              |

## Project structure

- `src/app.ts`: Hono Worker entry point and channel registration.
- `src/agents/`: specialized agents and their workflow contracts.
- `src/channels/`: external event adapters and channel-specific tools.
- `src/cloudflare.ts`: Cloudflare Sandbox export.
- `wrangler.jsonc`: Worker bindings, containers, Durable Objects, and required secrets.
