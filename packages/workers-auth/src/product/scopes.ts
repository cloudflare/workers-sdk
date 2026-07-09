// The Cloudflare OAuth scope catalog, shared by every CLI built on this auth
// layer (wrangler, cf, …). `DefaultScopeKeys` is a mutable live binding:
// `setLoginScopeKeys` reassigns it (wrangler's `--experimental-scopes` / product
// gating), and both the factory and each product's re-export observe the new
// value via the `AuthProduct.getDefaultScopeKeys` getter.

export const DefaultScopes = {
	"account:read":
		"See your account info such as account details, analytics, and memberships.",
	"user:read":
		"See your user info such as name, email address, and account memberships.",
	"workers:write":
		"See and change Cloudflare Workers data such as zones, KV storage, namespaces, scripts, and routes.",
	"workers_kv:write":
		"See and change Cloudflare Workers KV Storage data such as keys and namespaces.",
	"workers_routes:write":
		"See and change Cloudflare Workers data such as filters and routes.",
	"workers_scripts:write":
		"See and change Cloudflare Workers scripts, durable objects, subdomains, triggers, and tail data.",
	"workers_tail:read": "See Cloudflare Workers tail and script data.",
	"d1:write": "See and change D1 Databases.",
	"pages:write":
		"See and change Cloudflare Pages projects, settings and deployments.",
	"zone:read": "Grants read level access to account zone.",
	"ssl_certs:write": "See and manage mTLS certificates for your account",
	"ai:write": "See and change Workers AI catalog and assets",
	"ai-search:write": "See and change AI Search data",
	"ai-search:run": "Run search queries on your AI Search instances",
	"websearch.run": "Run search queries against Cloudflare Web Search",
	"agent-memory:write":
		"See and change Agent Memory data such as keys and namespaces.",
	"queues:write": "See and change Cloudflare Queues settings and data",
	"pipelines:write":
		"See and change Cloudflare Pipelines configurations and data",
	"secrets_store:write":
		"See and change secrets + stores within the Secrets Store",
	"artifacts:write":
		"See and change Cloudflare Artifacts data such as registries and artifacts",
	"flagship:write": "See and change Flagship feature flags and apps",
	"containers:write": "Manage Workers Containers",
	"cloudchamber:write": "Manage Cloudchamber",
	"connectivity:admin":
		"See, change, and bind to Connectivity Directory services, including creating services targeting Cloudflare Tunnel.",
	"email_routing:write":
		"See and change Email Routing settings, rules, and destination addresses.",
	"email_sending:write":
		"See and change Email Sending settings and configuration.",
	"browser:write": "See and manage Browser Run sessions",
	"challenge-widgets.write": "See and change Turnstile widgets",
} as const;

/**
 * The possible keys for a Scope.
 *
 * "offline_access" is automatically included.
 */
export type Scope = keyof typeof DefaultScopes;

export let DefaultScopeKeys = Object.keys(DefaultScopes) as Scope[];

export function setLoginScopeKeys(scopes: Scope[]) {
	DefaultScopeKeys = scopes;
}

export function validateScopeKeys(
	scopes: string[]
): scopes is typeof DefaultScopeKeys {
	return scopes.every((scope) => scope in DefaultScopes);
}
