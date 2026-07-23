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

Start the Cloudflare development server:

```sh
pnpm --filter @cloudflare/workers-sdk-flue dev
```

Run the smoke agent:

```sh
pnpm --filter @cloudflare/workers-sdk-flue smoke
```

## Evals

The `workspace-smoke` agent exposes an authenticated HTTP route for evals. The
Vitest global setup generates a new `FLUE_EVALS_BEARER_TOKEN` for each run, so
the eval process does not read the token from an environment variable or local
secret file. It starts a local Flue development server with the generated token
on an available port and stops the server after the suite finishes.

Run the eval suite with:

```sh
pnpm --filter @cloudflare/workers-sdk-flue evals
```

Use `evals:info` for detailed tool and usage output, or `evals:json` to write
`vitest-results.json`.

The smoke agent uses Workers AI and may require an authenticated Wrangler session. Its Codemode sandbox cannot execute Linux commands or access the network. Heavyweight repository builds and tests remain the responsibility of CI.
