export function makeFetch(
	remoteProxyConnectionString: string,
	bindingName: string,
	extraHeaders?: Headers
) {
	return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const request = new Request(input, init);

		const proxiedHeaders = new Headers(extraHeaders);
		for (const [name, value] of request.headers) {
			// The `Upgrade` header needs to be special-cased to prevent:
			//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
			if (name === "upgrade") {
				proxiedHeaders.set(name, value);
			} else {
				proxiedHeaders.set(`MF-Header-${name}`, value);
			}
		}
		proxiedHeaders.set("MF-URL", request.url);
		proxiedHeaders.set("MF-Binding", bindingName);
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		return fetch(remoteProxyConnectionString, req);
	};
}
