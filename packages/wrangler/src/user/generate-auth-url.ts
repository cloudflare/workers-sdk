// Re-export shim. The real implementation lives in `@cloudflare/workers-auth`.
//
// This file exists so wrangler's tests can continue to `vi.mock("../user/generate-auth-url", ...)`
// to produce deterministic OAuth URLs for snapshot testing. The mocked exports
// are imported by `./user.ts` and injected into the OAuth flow context,
// where the workers-auth package uses them internally.
export { generateAuthUrl, OAUTH_CALLBACK_URL } from "@cloudflare/workers-auth";
