// @ts-expect-error We'll swap in the entry point during build
import Worker from "__ENTRY_POINT__";

// @ts-expect-error
export * from "__ENTRY_POINT__";

export default {
	async fetch(req: Request, env: unknown, ctx: ExecutionContext) {
		// If triggered at specific URL, we want to convert fetch events to scheduled events.

		if (req.url.endsWith("/___scheduled")) {
			await Worker.scheduled(req, env, ctx);

			// We return a response as it was triggered from a fetch event
			return new Response("Successfully ran scheduled event");
		} else {
			// Not triggered at the specific URL,
			// so we just pass the fecth event through to the worker
			return await Worker.fetch(req, env, ctx);
		}
	},
};
