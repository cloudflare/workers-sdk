# Workers SDK Flue

This private workspace contains the Flue agents and workflows used by Workers SDK automation. It targets Cloudflare and uses Cloudflare Shell with Codemode for durable, structured workspace operations without Containers.

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

Regenerate the Wrangler `Env` types after changing bindings, agents, or workflows:

```sh
pnpm --filter @cloudflare/workers-sdk-flue cf-typegen
```

Create the ignored `.flue/.env` file with the required local secrets:

```sh
FLUE_BEARER_TOKEN=replace-with-a-random-token
GITHUB_TOKEN=replace-with-a-github-token
GITHUB_WEBHOOK_SECRET=replace-with-a-random-webhook-secret
```

Start the Cloudflare development server:

```sh
pnpm --filter @cloudflare/workers-sdk-flue dev
```

The agent HTTP routes require `FLUE_BEARER_TOKEN`. Configure it as a deployed
Worker secret, and provide the same value when running the smoke agent locally:

```sh
FLUE_BEARER_TOKEN=replace-with-a-random-token pnpm --filter @cloudflare/workers-sdk-flue smoke
```

## GitHub channel

Configure `FLUE_BEARER_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_WEBHOOK_SECRET` as
secrets on the deployed Worker. `GITHUB_TOKEN` authenticates outbound GitHub
API requests. `GITHUB_WEBHOOK_SECRET` verifies inbound webhook signatures and
must match the secret configured in GitHub.

Create a GitHub webhook with these settings:

- Payload URL: `https://<worker-host>/channels/github/webhook`
- Content type: `application/json`
- Secret: the deployed `GITHUB_WEBHOOK_SECRET` value
- Events: **Issue comments** and **Pull request review comments**

The webhook route uses GitHub signature verification instead of the bearer
authentication required by `/agents/*`. Created comments are dispatched to the
durable `github-assistant` agent, which can reply only to the repository and
issue or pull request associated with that verified webhook.

The smoke agent uses Workers AI and may require an authenticated Wrangler session. Its Codemode sandbox cannot execute Linux commands or access the network. Heavyweight repository builds and tests remain the responsibility of CI.
