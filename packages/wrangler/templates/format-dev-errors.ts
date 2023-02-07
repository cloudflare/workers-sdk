import worker from "__ENTRY_POINT__";

export * from "__ENTRY_POINT__";

export default <ExportedHandler>{
	...worker,
	async fetch(req, env, ctx) {
		if (worker.fetch === undefined) {
			throw new TypeError("Entry point missing `fetch` handler");
		}
		try {
			return await worker.fetch(req, env, ctx);
		} catch (err) {
			return new Response(
				`<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8" />
		<title>Error</title>
	</head>
	<body>
		<pre>${(err as Error).stack}</pre>
	</body>
</html>`,
				{
					status: 500,
					headers: {
						"Content-Type": "text/html",
					},
				}
			);
		}
	},
};
