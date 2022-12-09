import worker from "__ENTRY_POINT__";
export * from "__ENTRY_POINT__";

type Env = {
	// TODO: type this
};

/**
 * Setup globals/vars as required
 */

export default <ExportedHandler>{
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		if (worker.fetch === undefined) {
			throw new TypeError("Entry point missing `fetch` handler");
		}
		return worker.fetch(request, env, ctx);
	},
};
