# Remote Bindings - Agent Guide

Package-specific context only. See the repository `AGENTS.md` for shared conventions.

## Overview

`@cloudflare/remote-bindings` owns the remote-binding proxy session lifecycle shared by Wrangler, Vite, and Vitest. It must not import Wrangler.

## Structure

- `src/index.ts` - public session API
- `src/auth.ts` - workers-auth product selection
- `src/session/` - remote preview upload and local proxy session lifecycle
- `src/preview/` - edge-preview session and upload primitives
- `templates/` - embedded local proxy and remote binding proxy Workers

## Boundaries

- Public consumers use the package root.
- Wrangler retains its DevEnv and exposes a compatibility adapter over the package session API.
- Keep config parsing, bundling, local runtime, inspectors, assets, and Wrangler-specific error policy in Wrangler.
- Keep Miniflare external as a peer dependency so runtime classes preserve object identity.
- Reuse the embedded ProxyWorker for HTTP and WebSocket forwarding; do not add a Node.js proxy or custom credential parser.

## Authentication

- Explicit programmatic auth overrides take precedence.
- Otherwise use `@cloudflare/workers-auth/wrangler`.
- Presence of `CLOUDFLARE_JSON_AUTH`, including an empty value, selects `@cloudflare/workers-auth/cf`.

## Build

`tsdown` embeds all Worker templates through `worker:` virtual modules. Template edits must continue to build for the `workerd`, `worker`, and `browser` conditions.
