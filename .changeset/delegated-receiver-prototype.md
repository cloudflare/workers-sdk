---
"@cloudflare/codemods": patch
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": patch
---

Add opt-in delegated request receiver configuration and local verification support.

Carry receiver expectations through configuration, uploads and the private verifier channel. Local verification uses the shared managed verifier and private replay storage, with no customer replay binding. Requires a companion runtime supporting `enable_delegated_identity`; older runtimes fail closed.

Suppress native caller provenance on Vite infrastructure proxy bindings, so HTTP credentials reach verification instead of appearing to originate from the proxy Worker.

Use profile, trusted issuer and expected audience for normal receiver configuration. Derive the Session company identifier, discover authorization-server keys and apply documented RFC 9068/RS256/ES256 defaults privately. Retain optional explicit JWKS and tighter algorithm overrides; preserve omitted settings through upload/readback.

Migrate legacy `identity_receiver` configuration to `identityReceiver` without filling omitted defaults or inheriting receiver trust into named environments.
