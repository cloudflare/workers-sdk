import { DBUrl, Env } from "./types";

import { handleQueuedUrl, scheduled } from "./functions";
import h from "./api";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		return h.fetch(request, env, ctx);
	},

	async queue(batch: MessageBatch<Error>, env: Env): Promise<void> {
		for (const message of batch.messages) {
			const url: DBUrl = JSON.parse(message.body);
			await handleQueuedUrl(url, env.DB);
		}
	},

	async scheduled(env: Env): Promise<void> {
		await scheduled({
			authToken: env.AUTH_TOKEN,
			db: env.DB,
			queue: env.QUEUE,
			sitemapUrl: env.SITEMAP_URL,
		});
	},
};
