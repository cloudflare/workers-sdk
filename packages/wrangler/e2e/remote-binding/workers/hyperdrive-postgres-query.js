import pg from "pg";

export default {
	async fetch(request, env) {
		const binding = env.HYPERDRIVE_BINDING;
		const client = new pg.Client({
			host: binding.host,
			port: binding.port,
			user: binding.user,
			password: binding.password,
			database: binding.database,
		});
		try {
			await client.connect();
			const { rows } = await client.query(
				"SELECT 1 AS remote_hyperdrive_probe"
			);
			return Response.json(rows);
		} finally {
			await client.end();
		}
	},
};
