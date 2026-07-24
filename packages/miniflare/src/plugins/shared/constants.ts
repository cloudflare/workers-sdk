import SCRIPT_OBJECT_ENTRY from "worker:shared/object-entry";
import SCRIPT_REMOTE_PROXY_CLIENT from "worker:shared/remote-proxy-client";
import { CoreBindings, SharedBindings } from "../../workers";
import type { RemoteProxyConnectionString } from ".";
import type {
	Worker,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";

export const SOCKET_ENTRY = "entry";
export const SOCKET_ENTRY_LOCAL = "entry:local";
export const SOCKET_DEBUG_PORT = "debug-port";
export const SOCKET_DEV_REGISTRY = "dev-registry";
const SOCKET_DIRECT_PREFIX = "direct";

export function getDirectSocketName(workerIndex: number, entrypoint: string) {
	return `${SOCKET_DIRECT_PREFIX}:${workerIndex}:${entrypoint}`;
}

// Service looping back to Miniflare's Node.js process (for storage, etc)
export const SERVICE_LOOPBACK = "loopback";

// Service for the dev registry proxy worker (routes cross-process service bindings and DO proxies).
export const SERVICE_DEV_REGISTRY_PROXY = "dev-registry-proxy";

// Special host to use for Cap'n Proto connections. This is required to use
// JS RPC over `external` services in Wrangler's service registry.
export const HOST_CAPNP_CONNECT = "miniflare-unsafe-internal-capnp-connect";

export const WORKER_BINDING_SERVICE_LOOPBACK: Worker_Binding = {
	name: CoreBindings.SERVICE_LOOPBACK,
	service: { name: SERVICE_LOOPBACK },
};

const WORKER_BINDING_ENABLE_CONTROL_ENDPOINTS: Worker_Binding = {
	name: SharedBindings.MAYBE_JSON_ENABLE_CONTROL_ENDPOINTS,
	json: "true",
};
const WORKER_BINDING_ENABLE_STICKY_BLOBS: Worker_Binding = {
	name: SharedBindings.MAYBE_JSON_ENABLE_STICKY_BLOBS,
	json: "true",
};
let enableControlEndpoints = false;
export function getMiniflareObjectBindings(
	unsafeStickyBlobs: boolean
): Worker_Binding[] {
	const result: Worker_Binding[] = [];
	if (enableControlEndpoints) {
		result.push(WORKER_BINDING_ENABLE_CONTROL_ENDPOINTS);
	}
	if (unsafeStickyBlobs) {
		result.push(WORKER_BINDING_ENABLE_STICKY_BLOBS);
	}
	return result;
}
/** @internal */
export function _enableControlEndpoints() {
	enableControlEndpoints = true;
}

export function objectEntryWorker(
	durableObjectNamespace: Worker_Binding_DurableObjectNamespaceDesignator,
	// When provided, the namespace is baked into the worker as a static binding
	// (the original per-resource model). When omitted, the namespace is supplied
	// per-request via `ctx.props` (the props-based model that lets a single entry
	// service serve any number of namespaces).
	namespace?: string
): Worker {
	return {
		compatibilityDate: "2023-07-24",
		modules: [
			{ name: "object-entry.worker.js", esModule: SCRIPT_OBJECT_ENTRY() },
		],
		bindings: [
			...(namespace !== undefined
				? [{ name: SharedBindings.TEXT_NAMESPACE, text: namespace }]
				: []),
			{
				name: SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT,
				durableObjectNamespace,
			},
		],
	};
}

// A single remote-proxy client service can serve any number of remote bindings:
// the per-binding data (connection string, binding name, trace id) is supplied
// at runtime via `ctx.props` (see `buildRemoteProxyProps`), rather than baked
// into a per-binding service. The only static, non-props-able binding is the
// loopback service (used to surface diagnostics back to the Miniflare host,
// e.g. a Cloudflare Access block detected on the remote proxy response).
//
// `options.rawTcp` opts the service into raw TCP `connect()` tunnelling (see the
// `experimental` compatibility flag below). That is a property of the service
// itself, not of any individual binding, so it stays valid under the shared,
// props-based service model.
export function remoteProxyClientWorker(
	script?: () => string,
	options?: { rawTcp?: boolean }
) {
	return {
		compatibilityDate: "2025-01-01",
		// Raw TCP bindings (e.g. VPC networks) tunnel `binding.connect()` traffic
		// through this worker's inbound `connect` handler, which requires the
		// `experimental` compatibility flag (workerd#6059). Other bindings only
		// proxy HTTP/JSRPC and must not opt in.
		...(options?.rawTcp ? { compatibilityFlags: ["experimental"] } : {}),
		modules: [
			{
				name: "index.worker.js",
				esModule: (script ?? SCRIPT_REMOTE_PROXY_CLIENT)(),
			},
		],
		bindings: [WORKER_BINDING_SERVICE_LOOPBACK],
	};
}

// Builds the `props` value for a binding that points at a shared remote-proxy
// client service. Read back in `remote-proxy-client.worker.ts` via `ctx.props`.
export function buildRemoteProxyProps(
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	binding: string
): { json: string } {
	return {
		json: JSON.stringify({
			remoteProxyConnectionString: remoteProxyConnectionString?.href,
			binding,
			cfTraceId: process.env.CF_TRACE_ID,
		}),
	};
}

// Value of `unsafeUniqueKey` that forces the use of "colo local" ephemeral
// namespaces. These namespaces only provide a `get(id: string): Fetcher` method
// and construct objects without a `state` parameter. See the schema for details:
// https://github.com/cloudflare/workerd/blob/v1.20231206.0/src/workerd/server/workerd.capnp#L529-L543
// Using `Symbol.for()` instead of `Symbol()` in case multiple copies of
// `miniflare` are loaded (e.g. when configuring Vitest and when running pool)
export const kUnsafeEphemeralUniqueKey = Symbol.for(
	"miniflare.kUnsafeEphemeralUniqueKey"
);
export type UnsafeUniqueKey = string | typeof kUnsafeEphemeralUniqueKey;
