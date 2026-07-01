import { newWorkersRpcResponse } from "capnweb";
import { SharedHeaders } from "../shared/constants";

// Owner-side server for the shared "central storage owner". Runs in the
// detached owner process and exposes the owner's local storage services over
// HTTP/WebSocket using the same wire protocol as the remote-bindings proxy
// server (`packages/wrangler/templates/remoteBindings/ProxyServerWorker.ts`).
//
// Clients route their storage bindings through the shared remote-proxy client
// worker (`remote-proxy-client.worker.ts`) pointed at this server's address.
// Two transports share the one boundary:
//   - Fetch (KV / R2 / D1 / Images): a plain HTTP request carrying
//       - `MF-Binding`: a "<type>:<id>" key. The type selects the matching
//         object-entry service (bound by `Miniflare`); the id is forwarded via
//         `MF-Storage-Owner-Namespace` so a single shared entry service resolves
//         any resource — including ids only declared by other clients — without
//         a per-id binding.
//       - `MF-URL`: the original storage-protocol URL.
//       - `MF-Header-*`: the original request headers.
//   - JSRPC (Streams / Secrets Store): a capnweb WebSocket session, selected by
//     the `Upgrade` header + `MF-Binding` query param, dispatched onto the
//     bound entrypoint service.

type Env = Record<string, Fetcher | undefined>;

class BindingError extends Error {}

// Fetch types (KV/R2/D1/Images) are served by one generic entry service per
// type; the resource id is forwarded separately so a single binding serves any
// id. Returns the entry fetcher and the resource id.
function getFetchBinding(
	request: Request,
	env: Env
): { fetcher: Fetcher; id: string } {
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
	return { fetcher, id };
}

function getRpcBinding(request: Request, env: Env): Fetcher {
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
}

function isJSRPCBinding(request: Request): boolean {
	return (
		request.headers.has("Upgrade") &&
		new URL(request.url).searchParams.has("MF-Binding")
	);
}

export default {
	async fetch(request, env) {
		try {
			if (isJSRPCBinding(request)) {
				return await newWorkersRpcResponse(
					request,
					getRpcBinding(request, env)
				);
			}

			const { fetcher, id } = getFetchBinding(request, env);

			const originalHeaders = new Headers();
			for (const [name, value] of request.headers) {
				if (name.startsWith("mf-header-")) {
					originalHeaders.set(name.slice("mf-header-".length), value);
				} else if (name === "upgrade") {
					// The `Upgrade` header needs to be special-cased to prevent:
					//   TypeError: Worker tried to return a WebSocket in a response to
					//   a request which did not contain the header "Upgrade: websocket"
					originalHeaders.set(name, value);
				}
			}
			// Tell the shared object-entry service which resource this op targets.
			originalHeaders.set(SharedHeaders.STORAGE_OWNER_NAMESPACE, id);

			return await fetcher.fetch(
				request.headers.get("MF-URL") ?? "http://example.com",
				new Request(request, {
					redirect: "manual",
					headers: originalHeaders,
				})
			);
		} catch (e) {
			if (e instanceof BindingError) {
				return new Response(e.message, { status: 400 });
			}
			return new Response((e as Error).message, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
