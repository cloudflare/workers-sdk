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

Create the ignored `.flue/.env` file with a local bearer token:

```sh
FLUE_BEARER_TOKEN=replace-with-a-random-token
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

The smoke agent uses Workers AI and may require an authenticated Wrangler session. Its Codemode sandbox cannot execute Linux commands or access the network. Heavyweight repository builds and tests remain the responsibility of CI.
