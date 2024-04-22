import Greptime from 'greptime';

function getClient(env) {
	const { sql } = Greptime({
		host: env.HOST,
		dbname: env.DBNAME,
		username: env.USERNAME,
		password: env.PASSWORD,
		sqlConfig: {
			insertQueueConfig: {
				maxQueueTime: 0,
			},
		},
	});

	return sql;
}

export default {
	async fetch(request, env, ctx) {
		const client = getClient(env);

		const res = await client.showTables()
		return new Response(JSON.stringify(res), {
			headers: {
				'content-type': 'text/plain',
			},
		});
	},
};
