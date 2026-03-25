// Durable Object that uses dynamic import() in fetch handler.
// Regression test for https://github.com/cloudflare/workers-sdk/issues/5387
export class GreeterDO implements DurableObject {
	constructor(readonly state: DurableObjectState) {}
	async fetch(request: Request): Promise<Response> {
		const { greet } = await import("./greeting");
		return new Response(greet("DO"));
	}
}

export default {
	async fetch(
		request: Request,
		_env: unknown,
		_ctx: ExecutionContext
	): Promise<Response> {
		// Dynamic import inside a fetch handler — this is the pattern that
		// triggers the cross-DO I/O violation in vitest-pool-workers 0.13.x
		// when called via `exports.default.fetch()` in tests.
		// See: https://github.com/cloudflare/workers-sdk/issues/12924
		const { greet } = await import("./greeting");
		return new Response(greet("World"));
	},
} satisfies ExportedHandler;
