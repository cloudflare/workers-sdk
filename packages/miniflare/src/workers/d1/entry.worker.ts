import { WorkerEntrypoint } from "cloudflare:workers";
import { SharedBindings, SharedHeaders } from "../shared/constants";
import { D1Bindings, D1_WORKERD_SERVICE_NAME } from "./constants";
import type { WorkerdDebugPortConnector } from "../core/dev-registry-proxy-shared.worker";

interface Props {
	[SharedBindings.TEXT_NAMESPACE]?: string;
}
interface Env {
	[D1Bindings.DEBUG_PORT]: WorkerdDebugPortConnector;
}
type D1Fetcher = Fetcher & { query(request: unknown): Promise<unknown> };

// Routes D1's HTTP and RPC protocols to workerd's D1 for a database named at
// runtime, by props or the `MF-Namespace` header, which a binding's fixed
// props cannot do: the local explorer and shared storage call this.
export default class D1Entry extends WorkerEntrypoint<Env, Props> {
	#d1(request?: Request): D1Fetcher {
		const database =
			this.ctx.props?.[SharedBindings.TEXT_NAMESPACE] ??
			request?.headers.get(SharedHeaders.NAMESPACE) ??
			null;
		if (database === null) {
			throw new Error("d1:db:entry: no database in props or header");
		}
		return this.env[D1Bindings.DEBUG_PORT]
			.current()
			.getEntrypoint(D1_WORKERD_SERVICE_NAME, undefined, {
				database,
			}) as D1Fetcher;
	}

	fetch(request: Request): Promise<Response> {
		const headers = new Headers(request.headers);
		headers.delete(SharedHeaders.NAMESPACE);
		return this.#d1(request).fetch(new Request(request, { headers }));
	}

	query(request: unknown): Promise<unknown> {
		return this.#d1().query(request);
	}
}
