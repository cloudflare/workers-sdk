import { Client } from "pg";

// node:assert/strict is currently an unenv alias to node:assert
// this is not very common, but happens and we need to support it
import assert from "node:assert/strict";

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const client = new Client({
			user: env.DB_USERNAME,
			password: env.DB_PASSWORD,
			host: env.DB_HOSTNAME,
			port: Number(env.DB_PORT),
			database: env.DB_NAME,
		});
		await client.connect();
		const result = await client.query(`SELECT * FROM rnc_database`);
		assert(true);

		// Return the first row as JSON
		const resp = new Response(JSON.stringify(result.rows[0]), {
			headers: { "Content-Type": "application/json" },
		});

		// Clean up the client
		ctx.waitUntil(client.end());
		return resp;
	},
};
