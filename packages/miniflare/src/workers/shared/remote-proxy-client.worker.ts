import { WorkerEntrypoint } from "cloudflare:workers";

export default class Client extends WorkerEntrypoint<{
	remoteProxyConnectionString: string;
	binding: string;
}> {
	async fetch(request: Request) {
		const proxiedHeaders = new Headers();
		for (const [name, value] of request.headers) {
			// The `Upgrade` header needs to be special-cased to prevent:
			//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
			if (name === "upgrade" || name.startsWith("MF-")) {
				proxiedHeaders.set(name, value);
			} else {
				proxiedHeaders.set(`MF-Header-${name}`, value);
			}
		}
		proxiedHeaders.set("MF-URL", request.url);
		proxiedHeaders.set("MF-Binding", this.env.binding);
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		return fetch(this.env.remoteProxyConnectionString, req);
	}
}
