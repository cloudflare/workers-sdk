/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
export interface Env {
	// If you set another name in wrangler.toml as the value for 'binding',
	// replace "AI" with the variable name you defined.
	AI: Ai;
  }

  export default {
	async fetch(request, env): Promise<Response> {
	  const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
		prompt: "What is the origin of the phrase Hello, World",
	  });

	  return new Response(JSON.stringify(response));
	},
  } satisfies ExportedHandler<Env>;