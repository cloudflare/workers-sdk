import { DurableObject } from "cloudflare:workers";

export class Probe extends DurableObject {
	async fetch(request) {
		const container = this.ctx.container;
		switch (new URL(request.url).pathname) {
			case "/start":
				container.start({
					image: "docker.io/library/alpine:3.19",
					entrypoint: ["sleep", "infinity"],
					enableInternet: true,
				});
				return new Response("started");
			case "/exec": {
				const process = await container.exec(["uname", "-s"]);
				const stdout = await new Response(process.stdout).text();
				return Response.json({ stdout, exitCode: await process.exitCode });
			}
			case "/destroy":
				await container.destroy();
				return new Response("destroyed");
			default:
				return Response.json(Object.keys(container.images));
		}
	}
}

export default {
	fetch(request, _env, ctx) {
		return ctx.exports.Probe.getByName("probe").fetch(request);
	},
};
