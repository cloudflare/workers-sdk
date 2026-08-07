import { SharedHeaders } from "../shared/constants";
import {
	BindingError,
	createRemoteBindingsProxyServer,
} from "../shared/remote-bindings-proxy-server";

// Owner-side server for the shared "central storage owner". Runs in the detached
// owner process and exposes the owner's local storage over the remote-bindings
// boundary, reusing the shared proxy server (`remote-bindings-proxy-server.ts`).
//
// Clients route their storage bindings through the shared remote-proxy client
// worker (`remote-proxy-client.worker.ts`) pointed at this server's address:
//   - Fetch (KV / R2 / D1 / Images): `MF-Binding` is a "<type>:<id>" key. The
//     type selects the matching object-entry service (bound by `Miniflare`); the
//     id is forwarded via `MF-Storage-Owner-Namespace` so a single shared entry
//     service resolves any resource — including ids only declared by other
//     clients — without a per-id binding.
//   - JSRPC (Streams / Secrets Store): the `MF-Binding` query param selects the
//     bound entrypoint service directly.

type Env = Record<string, Fetcher | undefined>;

export default createRemoteBindingsProxyServer<Env>({
	resolveRpcBinding(request, env) {
		// For RPC the client (`makeRemoteProxyStub`) puts the binding key in the URL.
		const bindingKey = new URL(request.url).searchParams.get("MF-Binding");
		if (!bindingKey) {
			throw new BindingError("missing MF-Binding");
		}
		const target = env[bindingKey];
		if (!target) {
			throw new BindingError(
				`storage binding "${bindingKey}" not served by owner`
			);
		}
		return target;
	},
	resolveFetchBinding(request, env) {
		// Fetch types (KV/R2/D1/Images) are served by one generic entry service per
		// type; the resource id is forwarded separately so a single binding serves
		// any id.
		const bindingKey = request.headers.get("MF-Binding");
		if (!bindingKey) {
			throw new BindingError("missing MF-Binding");
		}
		const sep = bindingKey.indexOf(":");
		const type = sep === -1 ? bindingKey : bindingKey.slice(0, sep);
		const id = sep === -1 ? "" : bindingKey.slice(sep + 1);
		const fetcher = env[type];
		if (!fetcher) {
			throw new BindingError(`storage type "${type}" not served by owner`);
		}
		return {
			fetcher,
			rewriteHeaders(headers) {
				// Tell the shared object-entry service which resource this op targets.
				headers.set(SharedHeaders.STORAGE_OWNER_NAMESPACE, id);
			},
		};
	},
});
