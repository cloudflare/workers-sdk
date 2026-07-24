# Workers SDK Flue

This private workspace contains the Flue agents used by Workers SDK automation. It targets Cloudflare with Flue v2 and uses Cloudflare Shell with Codemode for durable, structured workspace operations without Containers.

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
FLUE_BEARER_TOKEN=replace-with-a-random-token
GITHUB_TOKEN=replace-with-a-github-token
GITHUB_WEBHOOK_SECRET=replace-with-a-random-webhook-secret
```

Start the Cloudflare development server:

```sh
pnpm --filter @cloudflare/workers-sdk-flue dev
```

The workspace smoke agent route requires `FLUE_BEARER_TOKEN`. Configure it as a
deployed Worker secret. The GitHub webhook route verifies requests with
`GITHUB_WEBHOOK_SECRET` instead of bearer authentication.

Send a message to the smoke agent after starting the development server:

```sh
curl --fail-with-body --request POST \
  http://localhost:5173/agents/workspace-smoke/local-smoke \
  --header "Authorization: Bearer $FLUE_BEARER_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"kind":"user","body":"Verify the durable workspace."}'
```

Read the conversation after the agent settles:

```sh
curl --fail-with-body \
  "http://localhost:5173/agents/workspace-smoke/local-smoke?view=history" \
  --header "Authorization: Bearer $FLUE_BEARER_TOKEN"
```

Cloudflare Shell requires the Worker Loader binding. If local development cannot
simulate Worker Loader, deploy a preview Worker and use the same requests against
its URL.

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
dispatch-only `github-assistant` agent, which can reply only to the repository
and issue or pull request associated with that verified webhook.

The smoke agent uses Workers AI and may require an authenticated Wrangler session. Its Codemode sandbox cannot execute Linux commands or access the network. Heavyweight repository builds and tests remain the responsibility of CI.
