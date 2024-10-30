const allowedPaths = new Set([
	'/require-ext',
	'/require-no-ext',
	'/node-builtins',
	'/require-json',
	'/cloudflare-imports',
	'/external-cloudflare-imports',

	'/third-party/react',
	'/third-party/remix',
	'/third-party/discord-api-types',
	'/third-party/slash-create',
]);

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const path = url.pathname;

		if (allowedPaths.has(path)) {
			const mod = await import(/* @vite-ignore */ `./${path}`);
			return Response.json(mod.default);
		}

		return new Response(`path not found: '${path}'`, { status: 404 });
	},
} satisfies ExportedHandler;
