// This file exists so wrangler's tests can continue to `vi.mock("../user/generate-auth-url", ...)`
// to produce deterministic OAuth URLs for snapshot testing. The mocked exports
// are imported by `./user.ts` and injected into the OAuth flow context,
// where the workers-auth package uses them internally.
export { generateAuthUrl } from "@cloudflare/workers-auth";

/**
 * The `redirect_uri` registered on Wrangler's OAuth app
 */
export const OAUTH_CALLBACK_URL = "http://localhost:8976/oauth/callback";
