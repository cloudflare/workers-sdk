import { Client } from './driver/postgres';

interface Bindings {
	CF_CLIENT_ID?: string;
	CF_CLIENT_SECRET?: string;
}

declare global {
	var CF_CLIENT_ID: string | undefined;
	var CF_CLIENT_SECRET: string | undefined;
}

const worker: ExportedHandler<Bindings> = {
	async fetch(request, env, ctx) {
		// Add Cloudflare Access Service Token credentials as global variables, used when Worker
		// establishes the connection to Cloudflare Tunnel. This ensures only approved services can
		// connect to your Tunnel.
		globalThis.CF_CLIENT_ID = env.CF_CLIENT_ID || undefined;
		globalThis.CF_CLIENT_SECRET = env.CF_CLIENT_SECRET || undefined;
		// NOTE: You may omit these values, however your Tunnel will accept traffic from _any_ source
		// on the Internet which may result in extra load on your database.

		try {
			// Configure the database client and create a connection.
			const client = new Client({
				user: 'postgres',
				database: 'postgres',
				// hostname is the full URL to your pre-created Cloudflare Tunnel, see documentation here:
				// https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/create-tunnel
				hostname: 'https://dev.example.com',
				password: 'password', // use a secret to store passwords
				port: '5432',
			});
			await client.connect();

			// Query the database.
			const param = 42;
			const result = await client.queryObject<number>`SELECT ${param} as answer;`;

			// Return result from database.
			return new Response(JSON.stringify(result.rows[0]));
		} catch (err) {
			return new Response((err as Error).message);
		}
	},
};

export default worker;
