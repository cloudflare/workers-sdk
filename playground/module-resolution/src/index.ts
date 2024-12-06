const modules = import.meta.glob('../src/**/*.ts');

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const path = url.pathname;

		const filePath = `${path.replace(/^\//, './')}.ts`;

		if (modules[filePath]) {
			const mod = await modules[filePath]();
			return Response.json((mod as { default: unknown }).default);
		}

		if (path === '/@alias/test') {
			const { test } = await import('@alias/test');
			return test();
		}

		return new Response(
			`path not found: '${path}' (the available paths are: ${Object.keys(
				modules,
			)
				.map((path) => path.replace(/^\.\//, '/').replace(/\.ts$/, ''))
				.join(', ')})`,
			{ status: 404 },
		);
	},
} satisfies ExportedHandler;
