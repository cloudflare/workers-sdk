/** Dependencies kept external so callers share runtime types and classes. */
export const EXTERNAL_DEPENDENCIES = [
	// Shared SDK packages preserve error identity and public declaration imports.
	"@cloudflare/config",
	"@cloudflare/containers-shared",
	"@cloudflare/workers-utils",
	// Native runtime and fetch classes must match the consumer's Miniflare instance.
	"miniflare",
	"undici",
];
