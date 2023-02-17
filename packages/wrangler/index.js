export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (pathname === "/setup") {
			await env.DB.exec(
				"CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT);"
			);
			return new Response(null, { status: 204 });
		} else if (pathname === "/query") {
			const rows = await env.DB.prepare("SELECT * FROM test;").all();
			return Response.json(rows.results);
		}
		throw new Error("Not found!");
	},
	async scheduled(controller, env, ctx) {
		const stmt = await env.DB.prepare(
			"INSERT INTO test (id, value) VALUES (?, ?)"
		);
		await stmt.bind(1, "one").run();
	},
};
