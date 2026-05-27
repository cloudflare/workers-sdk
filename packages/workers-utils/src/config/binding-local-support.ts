import type { Binding } from "../types";

/**
 * Local-dev capability of each binding type. Source of truth for
 * `pickRemoteBindings()` and `warnOrError()`.
 *
 * - `local-and-remote`: local simulator; `remote: true` opts into proxying.
 * - `local-only`: local simulator only; `remote: true` is a config error.
 * - `remote`: no local simulator *yet* — requires explicit `remote: true`.
 *   Move to `local-and-remote` once a simulator lands.
 * - `DO-NOT-USE-this-resource-will-never-have-a-local-simulator`: no local
 *   simulator, *ever* — fundamentally remote-only. Always auto-routed; user
 *   is warned about usage charges. Adding here is permanent; prefer any
 *   other variant if a simulator is plausible.
 */
export type BindingLocalSupport =
	| "local-and-remote"
	| "local-only"
	| "remote"
	| "DO-NOT-USE-this-resource-will-never-have-a-local-simulator";

const BINDING_LOCAL_SUPPORT: Record<
	Exclude<Binding["type"], `unsafe_${string}`> | "unsafe_hello_world",
	BindingLocalSupport
> = {
	plain_text: "local-only",
	secret_text: "local-only",
	json: "local-only",
	wasm_module: "local-only",
	text_blob: "local-only",
	data_blob: "local-only",
	version_metadata: "local-only",
	inherit: "local-only",
	logfwdr: "local-only",
	assets: "local-only",
	unsafe_hello_world: "local-only",
	durable_object_namespace: "local-only",
	hyperdrive: "local-only",
	fetcher: "local-only",
	analytics_engine: "local-only",
	secrets_store_secret: "local-only",
	ratelimit: "local-only",
	worker_loader: "local-only",

	kv_namespace: "local-and-remote",
	r2_bucket: "local-and-remote",
	d1: "local-and-remote",
	workflow: "local-and-remote",
	browser: "local-and-remote",
	images: "local-and-remote",
	stream: "local-and-remote",
	send_email: "local-and-remote",
	pipeline: "local-and-remote",
	service: "local-and-remote",
	// TODO: Miniflare currently ignores `remote: true` on queues, tracked in #13727.
	queue: "local-and-remote",

	vectorize: "remote",
	mtls_certificate: "remote",
	dispatch_namespace: "remote",

	// Reach out to the @cloudflare/wrangler team before adding anything here
	ai: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	ai_search: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	ai_search_namespace:
		"DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	media: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	artifacts: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	flagship: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	vpc_service: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	vpc_network: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
};

export function getBindingLocalSupport(
	type: Binding["type"]
): BindingLocalSupport {
	if (type in BINDING_LOCAL_SUPPORT) {
		return BINDING_LOCAL_SUPPORT[type as keyof typeof BINDING_LOCAL_SUPPORT];
	}
	return "local-only";
}
