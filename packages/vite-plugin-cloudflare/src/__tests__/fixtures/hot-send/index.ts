const MESSAGE_COUNT = 5;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
	async fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
		const { pathname } = new URL(request.url);

		// Send messages without awaiting them, as `import.meta.hot.send` returns
		// nothing to await.
		for (let i = 0; i < MESSAGE_COUNT; i++) {
			import.meta.hot?.send("hot-send-test", { pathname, i });
		}

		if (pathname === "/body") {
			return new Response("ok");
		}

		if (pathname === "/empty-wait-until") {
			// Keeping the request alive past the sends delivers all of them.
			ctx.waitUntil(wait(100));
		}

		return new Response(null, { status: 202 });
	},
};
