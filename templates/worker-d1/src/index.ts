// NOTE: this import only required during beta. Types will be available
// on @cloudflare/workers-types after launch
import type { Database } from '@cloudflare/d1';
import { Router } from 'itty-router';
const _404 = () => new Response(null, { status: 404 });

export interface Env {
	// Bindings
	DB: Database;
	// We can also use Env to cache things between requests
	__router?: Router;
}
let router: Router;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (!env.__router) {
			const router = Router();

			// Figure out what tables we have in the DB
			const response = await env.DB.prepare(
				`SELECT name from sqlite_schema where type = ? and name NOT LIKE ?;`
			)
				.bind('table', 'sqlite_%')
				.all();

			/* TODO: Fix once Miniflare is updated (it currently returns everything as .bulk) */
			const tables: Array<{ name: string }> = response.results
				? response.results
				: response.result[0];

			// Return an index
			router.get('/', async () => {
				return Response.json({
					tables: Object.fromEntries(
						tables.map(({ name }) => [
							name,
							{
								count: new URL(`/count/${name}`, request.url),
							},
						])
					),
				});
			});

			// Add a route for each table
			tables.forEach(({ name }) => {
				router.get('/count/' + encodeURIComponent(name), async () => {
					// TODO: .first() doesn't yet work on Miniflare due to implicit .bulk
					const response = await env.DB.prepare(`SELECT count(*) from [${name}];`).all();
					return Response.json(response);
				});
			});

			router.all('*', _404);
			env.__router = router;
		}

		return env.__router.handle(request);
	},
};
