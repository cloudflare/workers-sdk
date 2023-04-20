export default {
	async fetch(request, env) {
		const { pathname } = new URL(request.url);
		if (pathname !== "/") {
			return new Response((await import(`./${pathname.slice(1)}`)).default);
		}

		return env.ASSETS.fetch(request);
	},
};
