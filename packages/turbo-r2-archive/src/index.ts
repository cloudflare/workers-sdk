import { router } from "./routes";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		return router.fetch(request, env, ctx);
	},
};
