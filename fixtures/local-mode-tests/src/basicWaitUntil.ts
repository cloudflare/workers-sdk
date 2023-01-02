export default {
	async fetch(
		_request: Request,
		_env: object,
		ctx: { waitUntil: (arg0: unknown) => Promise<unknown> }
	) {
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		ctx.waitUntil(Promise.resolve(1));
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		ctx.waitUntil(Promise.resolve(2));
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		ctx.waitUntil(Promise.resolve(3));
		return new Response("Hello World!");
	},
};
