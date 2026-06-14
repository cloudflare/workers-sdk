import type { Binding } from "../types";

/**
 * Whether a binding type is usable by a Worker compiled for a standalone,
 * self-hosted `workerd` runtime (e.g. via `wrangler compile`).
 *
 * The standalone target is currently an **alpha** focused on stateless Workers
 * plus static assets. Stateful resources (KV, R2, D1, Queues), Durable Objects
 * (pending clustered `workerd`), and Cloudflare platform services (AI, Browser
 * Rendering, etc.) do not yet have a production-quality standalone story, so
 * they are reported as `unsupported`.
 *
 * - `supported`: works in a standalone bundle today.
 * - `unsupported`: no standalone story yet — surfaced as a warning by
 *   `wrangler dev` (the binding still works locally) and as an error by
 *   `wrangler compile`.
 */
export type StandaloneSupport = "supported" | "unsupported";

const STANDALONE_SUPPORT: Record<
	Exclude<Binding["type"], `unsafe_${string}`> | "unsafe_hello_world",
	StandaloneSupport
> = {
	// Pure value/config bindings + static assets are baked directly into the
	// generated `workerd` config and work without any Cloudflare backend.
	plain_text: "supported",
	secret_text: "supported",
	json: "supported",
	wasm_module: "supported",
	text_blob: "supported",
	data_blob: "supported",
	version_metadata: "supported",
	inherit: "supported",
	assets: "supported",

	// Stateful resources — no standalone production story yet.
	kv_namespace: "unsupported",
	r2_bucket: "unsupported",
	d1: "unsupported",
	queue: "unsupported",

	// Durable Objects need clustered `workerd` (cloudflare/workerd#6780).
	durable_object_namespace: "unsupported",
	workflow: "unsupported",

	// Cross-Worker / service-graph bindings — deferred.
	service: "unsupported",
	dispatch_namespace: "unsupported",
	fetcher: "unsupported",
	worker_loader: "unsupported",

	// Bindings that depend on a Cloudflare backend or platform service.
	hyperdrive: "unsupported",
	browser: "unsupported",
	images: "unsupported",
	stream: "unsupported",
	send_email: "unsupported",
	pipeline: "unsupported",
	vectorize: "unsupported",
	analytics_engine: "unsupported",
	secrets_store_secret: "unsupported",
	ratelimit: "unsupported",
	mtls_certificate: "unsupported",
	logfwdr: "unsupported",
	unsafe_hello_world: "unsupported",
	ai: "unsupported",
	ai_search: "unsupported",
	ai_search_namespace: "unsupported",
	media: "unsupported",
	artifacts: "unsupported",
	flagship: "unsupported",
	vpc_service: "unsupported",
	vpc_network: "unsupported",
	websearch: "unsupported",
	agent_memory: "unsupported",
};

export function getStandaloneSupport(type: Binding["type"]): StandaloneSupport {
	if (type in STANDALONE_SUPPORT) {
		return STANDALONE_SUPPORT[type as keyof typeof STANDALONE_SUPPORT];
	}
	// Be conservative about binding types we don't explicitly know about.
	return "unsupported";
}
