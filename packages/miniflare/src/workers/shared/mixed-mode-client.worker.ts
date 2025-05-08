export default {
	async fetch(request, env) {
		const proxiedHeaders = new Headers();
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
		proxiedHeaders.set("MF-Binding", env.binding);
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		return fetch(env.mixedModeConnectionString, req);
	},
} satisfies ExportedHandler<{
	mixedModeConnectionString: string;
	binding: string;
}>;
