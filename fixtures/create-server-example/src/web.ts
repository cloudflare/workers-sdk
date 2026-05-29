type Env = {
	API: Service<typeof import("./api").default>;
};

/**
 * Web Worker: renders user profiles and reports by calling the API Worker over a service binding.
 */
export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/") {
			return new Response("Hello World");
		}

		const userPathPrefix = "/users/";
		if (url.pathname.startsWith(userPathPrefix)) {
			const userId = url.pathname.slice(userPathPrefix.length);
			const { name } = await env.API.getUser(userId);
			return new Response(`Profile: ${name}`);
		}

		const reportsPathPrefix = "/reports/";
		if (url.pathname.startsWith(reportsPathPrefix)) {
			const date = url.pathname.slice(reportsPathPrefix.length);
			const report = await env.API.getDailyReport(date);

			if (report === null) {
				return new Response("No report", { status: 404 });
			}

			return new Response(
				`Daily report (${date}): active users ${report.join(", ")}`
			);
		}

		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
