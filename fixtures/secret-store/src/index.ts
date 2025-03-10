export interface Env {
	SECRET: any;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		try {
			const value = await env.SECRET.get();
			return new Response(value);
		} catch (e) {
			return new Response(
				e instanceof Error ? e.message : "Something went wrong",
				{
					status: 404,
				}
			);
		}
	},
};
