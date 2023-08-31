import { bustOldCache } from "./autoCacheBust";
import { router } from "./routes";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		return router.fetch(request, env, ctx);
	},
	async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
		await bustOldCache(env);
	},
};
