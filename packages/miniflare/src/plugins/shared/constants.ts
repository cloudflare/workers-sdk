import SCRIPT_OBJECT_ENTRY from "worker:shared/object-entry";
import SCRIPT_REMOTE_PROXY_CLIENT from "worker:shared/remote-proxy-client";
import {
	Worker,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import { CoreBindings, SharedBindings } from "../../workers";
import { RemoteProxyConnectionString } from ".";

export const SOCKET_ENTRY = "entry";
export const SOCKET_ENTRY_LOCAL = "entry:local";
const SOCKET_DIRECT_PREFIX = "direct";

export function getDirectSocketName(workerIndex: number, entrypoint: string) {
	return `${SOCKET_DIRECT_PREFIX}:${workerIndex}:${entrypoint}`;
}

// Service looping back to Miniflare's Node.js process (for storage, etc)
export const SERVICE_LOOPBACK = "loopback";

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
	bindingType?: string
) {
	return {
		compatibilityDate: "2025-01-01",
		modules: [
			{
				name: "index.worker.js",
				esModule: SCRIPT_REMOTE_PROXY_CLIENT(),
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
			...(bindingType
				? [
						{
							name: "bindingType",
							text: bindingType,
						},
					]
				: []),
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
