import type { Binding } from "../types";

/**
 * Friendly names for binding types (keyed by Binding["type"] discriminator).
 * These are mostly (but not always) non-plural versions of friendlyBindingNames
 */
const bindingTypeFriendlyNames: Record<Binding["type"], string> = {
	// The 3 binding types below are all rendered as "Environment Variable" to preserve existing behaviour (friendlyBindingNames.vars)
	plain_text: "Environment Variable",
	secret_text: "Environment Variable",
	json: "Environment Variable",
	kv_namespace: "KV Namespace",
	send_email: "Send Email",
	wasm_module: "Wasm Module",
	text_blob: "Text Blob",
	browser: "Browser Run",
	analytics: "Analytics SQL",
	ai: "AI",
	images: "Images",
	stream: "Stream",
	version_metadata: "Worker Version Metadata",
	data_blob: "Data Blob",
	durable_object_namespace: "Durable Object",
	workflow: "Workflow",
	queue: "Queue",
	r2_bucket: "R2 Bucket",
	d1: "D1 Database",
	vectorize: "Vectorize Index",
	ai_search_namespace: "AI Search Namespace",
	ai_search: "AI Search Instance",
	agent_memory: "Agent Memory",
	hyperdrive: "Hyperdrive Config",
	service: "Worker",
	fetcher: "Service Binding",
	analytics_engine: "Analytics Engine Dataset",
	dispatch_namespace: "Dispatch Namespace",
	mtls_certificate: "mTLS Certificate",
	pipeline: "Pipeline",
	k2: "K2 Stream",
	secrets_store_secret: "Secrets Store Secret",
	artifacts: "Artifacts",
	logfwdr: "logfwdr",
	unsafe_hello_world: "Hello World",
	flagship: "Flagship",
	ratelimit: "Rate Limit",
	worker_loader: "Worker Loader",
	vpc_service: "VPC Service",
	vpc_network: "VPC Network",
	media: "Media",
	assets: "Assets",
	inherit: "Inherited",
} as const;

/**
 * Get a friendly name for a binding type, handling unsafe bindings
 */
export function getBindingTypeFriendlyName(
	bindingType: Binding["type"]
): string {
	if (bindingType in bindingTypeFriendlyNames) {
		return bindingTypeFriendlyNames[bindingType];
	}

	if (bindingType.startsWith("unsafe_")) {
		return "Unsafe Metadata";
	}

	return bindingType;
}
