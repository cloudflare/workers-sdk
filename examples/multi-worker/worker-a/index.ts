import type WorkerB from '../worker-b';
import type { NamedEntrypoint } from '../worker-b';

interface Env {
	WORKER_B: Fetcher<WorkerB>;
	NAMED_ENTRYPOINT: Fetcher<NamedEntrypoint>;
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const fetchResponse = await env.WORKER_B.fetch(request);
		const fetchResult = await fetchResponse.json();
		const rpcResult = await env.WORKER_B.add(4, 5);
		const namedEntrypointResult = await env.NAMED_ENTRYPOINT.multiply(3, 4);

		return Response.json({
			name: 'Worker A',
			pathname: url.pathname,
			worker_b_fetch_result: fetchResult,
			worker_b_rpc_result: rpcResult,
			named_entrypoint_result: namedEntrypointResult,
		});
	},
} satisfies ExportedHandler<Env>;
