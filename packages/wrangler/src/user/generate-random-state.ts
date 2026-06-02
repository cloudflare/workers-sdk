// Re-export shim. The real implementation lives in `@cloudflare/workers-auth`.
//
// This file exists so wrangler's tests can continue to `vi.mock("../user/generate-random-state", ...)`
// to produce deterministic CSRF state values for snapshot testing. The
// mocked export is imported by `./user.ts` and injected into the OAuth flow
// context, where the workers-auth package uses it internally.
export { generateRandomState } from "@cloudflare/workers-auth";
