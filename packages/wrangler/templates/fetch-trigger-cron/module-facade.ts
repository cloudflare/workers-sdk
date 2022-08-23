// @ts-expect-error We'll swap in the entry point during build
import Worker from "__ENTRY_POINT__";

// @ts-expect-error
export * from "__ENTRY_POINT__";

export default {
	async fetch(req: Request, env: unknown, ctx: ExecutionContext) {
		// If triggered at specific URL, we want to convert fetch events to scheduled events.
		// Parse the url to get the path
		const url = new URL(req.url);
		const path = url.pathname;

		if (path.endsWith("/___scheduled")) {
			// We check to see if we have a cron param in the url
			const cron = url.searchParams.get("cron");
			const schEvt = {
				...req,
				...(cron ? { cron } : {}),
				type: "scheduled",
			};

			await Worker.scheduled(schEvt, env, ctx);

			// We return a response as it was triggered from a fetch event
			return new Response("Successfully ran scheduled event");
		} else {
			// Not triggered at the specific URL,
			// so we just pass the fecth event through to the worker
			return await Worker.fetch(req, env, ctx);
		}
	},
};
