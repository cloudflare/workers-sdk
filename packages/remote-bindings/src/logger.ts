// The package's logger is `@cloudflare/workers-auth`'s `OAuthFlowLogger` (the
// same shape the OAuth flow and Access detection expect). `console` satisfies it.
export type { OAuthFlowLogger as Logger } from "@cloudflare/workers-auth";
