// @ts-expect-error We'll swap in the entry point during build
import Worker from "__ENTRY_POINT__";

// @ts-expect-error
export * from "__ENTRY_POINT__";

export default {
	async fetch(req: Request, env: unknown, ctx: ExecutionContext) {
		console.log("Middleware triggered.");
		return new Response("Hello worker from middleware!", {
			headers: { "content-type": "text/plain" },
		});
		// return await Worker.fetch(req, env, ctx);
	},
};
