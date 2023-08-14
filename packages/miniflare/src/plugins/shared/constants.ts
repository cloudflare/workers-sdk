import SCRIPT_OBJECT_ENTRY from "worker:shared/object-entry";
import {
	Worker,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import { CoreBindings, SharedBindings } from "../../workers";

export const SOCKET_ENTRY = "entry";

// Service looping back to Miniflare's Node.js process (for storage, etc)
export const SERVICE_LOOPBACK = "loopback";

// Even though we inject the `cf` blob in the entry script, we still need to
// specify a header, so we receive things like `cf.cacheKey` in loopback
// requests.
export const HEADER_CF_BLOB = "MF-CF-Blob";

export const WORKER_BINDING_SERVICE_LOOPBACK: Worker_Binding = {
	name: CoreBindings.SERVICE_LOOPBACK,
	service: { name: SERVICE_LOOPBACK },
};

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
