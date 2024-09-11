import { AsyncLocalStorage } from "node:async_hooks";

const asyncLocalStorage = new AsyncLocalStorage<number>();

export default {
	async fetch(req: Request, env: unknown, ctx: ExecutionContext) {
		if (new URL(req.url).pathname !== "/") {
			return new Response("No Found", { status: 404 });
		}

		const results = await Promise.all([
			asyncLocalStorage.run(1, async () => getValue()),
			asyncLocalStorage.run(2, async () => getValue()),
			asyncLocalStorage.run(3, async () => getValue()),
		]);

		return new Response(`Working ${JSON.stringify(results)}`);
	},
};

async function getValue() {
	await new Promise((resolve) => setTimeout(resolve, 1000));
	return asyncLocalStorage.getStore();
}
