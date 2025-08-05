import { DurableObject } from "cloudflare:workers";

class FixtureTestContainerBase extends DurableObject<Env> {
	container: globalThis.Container;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.container = ctx.container;
	}

	async fetch(req: Request) {
		if (!this.container.running) {
			this.container.start({
				entrypoint: ["node", "app.js"],
				enableInternet: false,
			});
			// On the first request we simply start the container and return,
			// on the following requests the container can actually be accessed.
			// Note that we do this this way because container.start is not awaitable
			// meaning that we can't simply wait here for the container to be ready
			return new Response("Container started");
		}
		return this.container
			.getTcpPort(8080)
			.fetch("http://foo/bar/baz", { method: "POST", body: "hello" });
	}
}

export class FixtureTestContainerA extends FixtureTestContainerBase {}
export class FixtureTestContainerB extends FixtureTestContainerBase {}

export default {
	async fetch(request, env): Promise<Response> {
		const getContainerText = async (
			container: "CONTAINER_A" | "CONTAINER_B"
		) => {
			const id = env[container].idFromName("container");
			const stub = env[container].get(id);
			return await (await stub.fetch(request)).text();
		};
		const containerAText = await getContainerText("CONTAINER_A");
		const containerBText = await getContainerText("CONTAINER_B");
		return new Response(
			`Response from A: "${containerAText}"` +
				" " +
				`Response from B: "${containerBText}"`
		);
	},
} satisfies ExportedHandler<Env>;
