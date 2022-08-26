export default {
	async fetch(request: Request, env) {
		const pathname = new URL(request.url).pathname;
		if (pathname.startsWith("/w/")) {
			const docId = pathname.split("/")[2];
			const w = env.dispatcher.get(docId);
			return w.fetch(request);
		}
		return new Response(`Not Found`, { status: 404 });
	},
};
