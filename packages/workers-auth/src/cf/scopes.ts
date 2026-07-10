// cf's OAuth scope catalog — the exact scope set the `cf` CLI registers. This
// is deliberately separate from wrangler's smaller catalog (`../product/scopes`):
// cf requests the full Cloudflare product surface, so it carries its own list
// rather than reusing wrangler's.
//
// The standard `offline_access` scope is appended automatically by the OAuth
// flow, so it is intentionally omitted here. The non-standard `offline` alias
// is kept because the Cloudflare OAuth server requires it alongside
// `offline_access`.
//
// Unlike wrangler's catalog, cf's registration carries no per-scope
// descriptions, so this is a flat list rather than a key → description map.

const CF_SCOPES = [
	"openid",
	"offline",
	"user:read",
	"account:read",
	"access:read",
	"access:write",
	"agw:read",
	"agw:run",
	"agw:write",
	"ai:read",
	"ai:write",
	"ai-search:read",
	"ai-search:run",
	"ai-search:write",
	"aiaudit:read",
	"aiaudit:write",
	"aig:read",
	"aig:write",
	"auditlogs:read",
	"browser:read",
	"browser:write",
	"cfone:read",
	"cfone:write",
	"cloudchamber:write",
	"connectivity:admin",
	"connectivity:bind",
	"connectivity:read",
	"constellation:write",
	"containers:write",
	"d1:write",
	"dex:read",
	"dex:write",
	"dns_analytics:read",
	"dns_records:edit",
	"dns_records:read",
	"dns_settings:read",
	"firstpartytags:write",
	"images:read",
	"images:write",
	"lb:edit",
	"lb:read",
	"logpush:read",
	"logpush:write",
	"mcp_portals:read",
	"mcp_portals:write",
	"notebook-examples:read",
	"notification:read",
	"notification:write",
	"pages:read",
	"pages:write",
	"pipelines:read",
	"pipelines:setup",
	"pipelines:write",
	"query_cache:write",
	"queues:write",
	"r2_catalog:write",
	"radar:read",
	"rag:read",
	"rag:write",
	"registrar:read",
	"registrar:write",
	"secrets_store:read",
	"secrets_store:write",
	"sso-connector:read",
	"sso-connector:write",
	"ssl_certs:write",
	"teams:pii",
	"teams:read",
	"teams:secure_location",
	"teams:write",
	"url_scanner:read",
	"url_scanner:write",
	"vectorize:write",
	"workers:read",
	"workers:write",
	"workers_builds:read",
	"workers_builds:write",
	"workers_deployments:read",
	"workers_kv:write",
	"workers_observability:read",
	"workers_observability:write",
	"workers_observability_telemetry:write",
	"workers_routes:write",
	"workers_scripts:write",
	"workers_tail:read",
	"zone:read",
] as const;

/**
 * The possible keys for a cf Scope.
 *
 * "offline_access" is automatically included.
 */
export type Scope = (typeof CF_SCOPES)[number];

export let DefaultScopeKeys = [...CF_SCOPES] as Scope[];

export function setLoginScopeKeys(scopes: Scope[]) {
	DefaultScopeKeys = scopes;
}

const CF_SCOPE_SET: ReadonlySet<string> = new Set(CF_SCOPES);

export function validateScopeKeys(
	scopes: string[]
): scopes is typeof DefaultScopeKeys {
	return scopes.every((scope) => CF_SCOPE_SET.has(scope));
}
