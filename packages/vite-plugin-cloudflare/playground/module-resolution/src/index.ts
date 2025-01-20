const modules = import.meta.glob("../src/**/*.ts");

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const path = url.pathname;

		const filePath = `${path.replace(/^\//, "./")}.ts`;

		if (modules[filePath]) {
			const mod = await modules[filePath]();
			return Response.json((mod as { default: unknown }).default);
		}

		if (path === "/@alias/test") {
			const { test } = await import("@alias/test");
			return test();
		}

		const html = `<!DOCTYPE html>
            <body>
              <h1>Module Resolution App</h1>
              <p>
                This app is an example/test for dependencies module resolution being performed in the Cloudflare environment (inside the workerd runtime)
              </p>
              <hr />
              <h2>Available Routes</h2>
              <ul>
              ${[...Object.keys(modules), "/@alias/test"]
								.map((path) => path.replace(/^\.\//, "/").replace(/\.ts$/, ""))
								.map(
									(route) =>
										`                <li><a href="${route}">${route}</a></li>`
								)
								.join("\n")}
              </ul>
            </body>`;

		return new Response(html, {
			headers: {
				"content-type": "text/html;charset=UTF-8",
			},
		});
	},
} satisfies ExportedHandler;
