/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	Learning_DurableObjects: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
}

// Worker
('use strict');

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
	'Access-Control-Max-Age': '86400',
};

// src/index.ts
var src_default = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		let url = new URL(request.url);
		let [_, commentID, operation] = url.pathname.split('/');
		let id = env.Learning_DurableObjects.idFromName(commentID);
		let stub = env.Learning_DurableObjects.get(id);
		// request.headers.set('Origin', url.origin);
		return stub.fetch(request);
	},
};
var DurableObject = class {
	state: DurableObjectState;
	env: Env;
	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}
	async fetch(request: Request) {
		let url = new URL(request.url);
		let value: number = (await this.state.storage.get('likes')) || 0;
		if (url.pathname.endsWith('/increment')) {
			value++;
			await this.state.storage.put('likes', value);
		} else if (url.pathname.endsWith('/decrement')) {
			value--;
			await this.state.storage.put('likes', value);
		}
		return new Response(`${value}`, {
			headers: { ...corsHeaders },
		});
		// }
	}
};
export { DurableObject, src_default as default };
//# sourceMappingURL=index.js.map
