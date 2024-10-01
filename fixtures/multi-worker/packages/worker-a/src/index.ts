export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const result = await env.WORKER_B.hello();

		return new Response(
            `Worker A called Worker B: ${result}`
        );
	},
};





export interface Env {
	WORKER_B: { hello(): Promise<string> };
}