import { DurableObject } from "cloudflare:workers";

class ContainerObject extends DurableObject {
	override async fetch(req: Request) {
		const container = this.ctx.container;
		if (container === undefined) {
			return new Response("Container is not configured.", { status: 404 });
		}
		const path = new URL(req.url).pathname;
		switch (path) {
			case "/status":
				return new Response(JSON.stringify(container.running));

			case "/images":
				return Response.json(Object.keys(container.images));

			case "/destroy":
				if (!container.running) {
					throw new Error("Container is not running.");
				}
				await container.destroy();
				return new Response(JSON.stringify(container.running));

			case "/start":
				container.start({
					...(container.images.app === undefined
						? {}
						: { image: container.images.app }),
					entrypoint: ["node", "app.js"],
					env: { A: "B", C: "D", L: "F", MESSAGE: "from vite" },
					enableInternet: false,
				});
				// this doesn't instantly start, so we will need to poll /fetch
				return new Response("Container create request sent...");

			case "/fetch": {
				const res = await container
					.getTcpPort(8080)
					// actual request doesn't matter
					.fetch("http://foo/bar/baz", { method: "POST", body: "hello" });
				return new Response(await res.text());
			}

			case "/destroy-with-monitor": {
				// if (!container.running) {
				// 	throw new Error("Container is not running.");
				// }
				const monitor = container.monitor();
				await container.destroy();
				await monitor;
				return new Response("Container destroyed with monitor.");
			}

			default:
				return new Response("Hi from Container DO");
		}
	}
}

export class DockerfileContainer extends ContainerObject {}
export class NamedImagesContainer extends ContainerObject {}
export class RegistryContainer extends ContainerObject {}

export default {
	async fetch(request, _env, ctx): Promise<Response> {
		const url = new URL(request.url);

		let service: Fetcher | undefined;
		let prefix = "";
		if (
			url.pathname === "/dockerfile" ||
			url.pathname.startsWith("/dockerfile/")
		) {
			service = ctx.exports.DockerfileContainer.getByName("container");
			prefix = "/dockerfile";
		} else if (
			url.pathname === "/named-images" ||
			url.pathname.startsWith("/named-images/")
		) {
			service = ctx.exports.NamedImagesContainer.getByName("container");
			prefix = "/named-images";
		} else if (
			url.pathname === "/registry" ||
			url.pathname.startsWith("/registry/")
		) {
			service = ctx.exports.RegistryContainer.getByName("container");
			prefix = "/registry";
		}

		if (!service) {
			return new Response(
				"Not found. Use `/dockerfile/...`, `/named-images/...`, or `/registry/...`.",
				{ status: 404 }
			);
		}

		const forwardedUrl = new URL(url);
		forwardedUrl.pathname = url.pathname.slice(prefix.length) || "/";
		return service.fetch(new Request(forwardedUrl.toString(), request));
	},
} satisfies ExportedHandler;
