export default {
	async fetch(request, env) {
		const proxiedHeaders = new Headers();
		for (const [name, value] of request.headers) {
			proxiedHeaders.set(`MF-Header-${name}`, value);
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
