import { createConnection } from "mysql2/promise";

export default {
	async fetch(request, env) {
		const binding = env.HYPERDRIVE_BINDING;
		const connection = await createConnection({
			host: binding.host,
			port: binding.port,
			user: binding.user,
			password: binding.password,
			database: binding.database,
			disableEval: true,
		});
		try {
			const [rows] = await connection.query(
				"SELECT 1 AS remote_hyperdrive_probe"
			);
			return Response.json(rows);
		} finally {
			await connection.end();
		}
	},
};
