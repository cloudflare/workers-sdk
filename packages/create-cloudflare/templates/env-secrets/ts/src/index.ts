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
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const body = [`Secret token: ${env.SECRET_TOKEN}`, `Analytics ID: ${env.ANALYTICS_ID}`, `Sentry DSN: ${env.SENTRY_DSN}`].join('\n');
		return new Response(body);
	},
};
