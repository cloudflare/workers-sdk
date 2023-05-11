import { Env } from './types';
export { RequestDurableObject } from './request-durable-object';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		// parse the URL and get Durable Object ID from the URL
		const url = new URL(request.url);
		const idFromUrl = url.pathname.slice(1);

		// construct the Durable Object ID, use the ID from pathname or create a new unique id
		const doId = idFromUrl ? env.DO_REQUEST.idFromString(idFromUrl) : env.DO_REQUEST.newUniqueId();

		// get the Durable Object stub for our Durable Object instance
		const stub = env.DO_REQUEST.get(doId);

		// pass the request to Durable Object instance
		return stub.fetch(request);
	},
};
