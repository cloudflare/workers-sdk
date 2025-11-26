import { WorkerEntrypoint } from "cloudflare:workers";

export default {
	async fetch(request, env, ctx) {
		return new Response("👋 " + (await ctx.exports.NamedEntryPoint.greet()));
	},
} satisfies ExportedHandler;

export class NamedEntryPoint extends WorkerEntrypoint {
	greet() {
		return `Hello ${this.env.NAME} from Auxiliary NamedEntryPoint!`;
	}
}
