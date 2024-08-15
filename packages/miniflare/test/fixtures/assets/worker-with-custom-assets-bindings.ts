interface Env {
	//  custom kv binding name
	CUSTOM_ASSETS_NAMESPACE: KVNamespace;
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const { pathname } = url;

		const content = await env.CUSTOM_ASSETS_NAMESPACE.get(pathname);
		return new Response(content);
	},
};
