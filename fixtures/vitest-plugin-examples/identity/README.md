# Local identity services in Vitest

Run `pnpm exec vitest run` in this directory using the matching draft packages.
The public identity binding is backed by the shared local signer, discovery,
verifier and saved-account broker. No test supplies protected props, replaces
the binding or starts a separate broker. This fixture qualifies issuance, signed
requests and pinned absence through the Workers Vitest pool. The Miniflare
identity suite additionally exercises consent, refresh/authentication profiles,
receiver integration and persistence.
