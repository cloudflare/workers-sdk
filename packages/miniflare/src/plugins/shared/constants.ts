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
	namespace: string
): Worker {
	return {
		compatibilityDate: "2023-07-24",
		modules: [
			{ name: "object-entry.worker.js", esModule: SCRIPT_OBJECT_ENTRY() },
		],
		bindings: [
			{ name: SharedBindings.TEXT_NAMESPACE, text: namespace },
			{
				name: SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT,
				durableObjectNamespace,
			},
		],
	};
}

export function remoteProxyClientWorker(
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	binding: string,
	script?: () => string
) {
	const cfTraceId = process.env.CF_TRACE_ID;
	// Forward any auth headers needed to reach the remote-bindings proxy server
	// (e.g. a Cloudflare Access service token or a `cloudflared` cookie) to the
	// proxy client worker, so both the HTTP (`makeFetch`) and WebSocket/capnweb
	// (`makeRemoteProxyStub`) paths can attach them. These are computed
	// wrangler-side via `@cloudflare/workers-auth`'s `getAccessHeaders()` and
	// carried on the connection string, rather than read from `process.env`
	// here — so non-wrangler embedders (Vite plugin, vitest-pool-workers,
	// getPlatformProxy, programmatic users) work too, and so multiworker dev
	// stays correct when different workers target different Access-protected
	// hosts. Forwarded as a single opaque JSON binding so the worker side stays
	// agnostic to the auth scheme. Without them, remote bindings fail with a
	// 401/403 when the workers.dev domain is protected by Access.
	const remoteProxyHeaders = remoteProxyConnectionString?.remoteProxyHeaders;
	return {
		compatibilityDate: "2025-01-01",
		modules: [
			{
				name: "index.worker.js",
				esModule: (script ?? SCRIPT_REMOTE_PROXY_CLIENT)(),
			},
		],
		bindings: [
			...(remoteProxyConnectionString?.href
				? [
						{
							name: "remoteProxyConnectionString",
							text: remoteProxyConnectionString.href,
						},
					]
				: []),
			{
				name: "binding",
				text: binding,
			},
			...(cfTraceId
				? [
						{
							name: "cfTraceId",
							text: cfTraceId,
						},
					]
				: []),
			...(remoteProxyHeaders && Object.keys(remoteProxyHeaders).length > 0
				? [
						{
							name: "remoteProxyHeaders",
							text: JSON.stringify(remoteProxyHeaders),
						},
					]
				: []),
			// Loopback binding so the proxy client can report diagnostics
			// (e.g. a Cloudflare Access block on the remote proxy server)
			// back to the Miniflare host for a single, actionable warning.
			WORKER_BINDING_SERVICE_LOOPBACK,
		],
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
