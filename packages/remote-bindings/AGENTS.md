# Remote Bindings - Agent Guide

Package-specific context only. See the repository `AGENTS.md` for shared conventions.

## Overview

`@cloudflare/remote-bindings` owns remote-binding session lifecycle and the host-agnostic DevEnv kernel shared with Wrangler. It must not import Wrangler.

## Structure

- `src/index.ts` - public session API
- `src/auth.ts` - workers-auth product selection
- `src/session/` - remote proxy session composition and static config/bundle controllers
- `src/preview/` - edge-preview session and upload primitives
- `src/internal/dev-env/` - shared controller bus, DevEnv, proxy, remote runtime, events and types
- `templates/` - embedded local proxy, inspector proxy and remote binding proxy Workers

## Boundaries

- Public consumers use the package root.
- Wrangler consumes `@cloudflare/remote-bindings/internal` to configure the shared DevEnv kernel with Wrangler-specific adapters.
- Keep config parsing, bundling, local runtime, assets, Wrangler logging and user-facing error policy in Wrangler.
- Keep Miniflare external as a peer dependency so runtime classes preserve object identity.
- Do not add a separate HTTP/WebSocket proxy or custom credential parser.

## Authentication

- Explicit programmatic auth overrides take precedence.
- Otherwise use `@cloudflare/workers-auth/wrangler`.
- Presence of `CLOUDFLARE_JSON_AUTH`, including an empty value, selects `@cloudflare/workers-auth/cf`.

## Build

`tsdown` embeds all Worker templates through `worker:` virtual modules. Template edits must continue to build for the `workerd`, `worker`, and `browser` conditions.
