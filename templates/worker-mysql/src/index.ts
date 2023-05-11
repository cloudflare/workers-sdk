import { Client } from './driver/mysql';

interface Bindings {
	TUNNEL_HOST?: string;
	CF_CLIENT_ID?: string;
	CF_CLIENT_SECRET?: string;
}

const worker: ExportedHandler<Bindings> = {
	async fetch(request, env, ctx) {
		// Add Cloudflare Access Service Token credentials as global variables, used when Worker
		// establishes the connection to Cloudflare Tunnel. This ensures only approved services can
		// connect to your Tunnel.
		// globalThis.CF_CLIENT_ID = env.CF_CLIENT_ID || undefined
		// globalThis.CF_CLIENT_SECRET = env.CF_CLIENT_SECRET || undefined
		// NOTE: You may omit these values, however your Tunnel will accept traffic from _any_ source
		// on the Internet which may result in extra load on your database.

		try {
			// Configure the database client and create a connection.
			const mysql = new Client();
			const mysqlClient = await mysql.connect({
				username: 'user',
				db: 'appdb',
				// hostname is the full URL to your pre-created Cloudflare Tunnel, see documentation here:
				// https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/create-tunnel
				hostname: env.TUNNEL_HOST || 'https://dev.example.com',
				password: 'password', // use a secret to store passwords
			});

			// Query the database.
			const param = 42;
			const result = await mysqlClient.query('SELECT ?;', [param]);

			// Return result from database.
			return new Response(JSON.stringify({ result }));
		} catch (err) {
			return new Response((err as Error).message);
		}
	},
};

export default worker;
