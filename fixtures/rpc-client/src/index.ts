import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	override async fetch(request: Request): Promise<Response> {
		return new Response(
			JSON.stringify(
				{
					"DEFAULT_BINDING.fetch": await (
						await this.env.DEFAULT_BINDING.fetch(request)
					).text(),
					"DEFAULT_BINDING.sum": await this.env.DEFAULT_BINDING.sum(1, 2),
					"NAMED_EXPORT_BINDING.fetch": await (
						await this.env.NAMED_EXPORT_BINDING.fetch(request)
					).text(),
					"NAMED_EXPORT_BINDING.greet":
						await this.env.NAMED_EXPORT_BINDING.greet("john"),
				},
				null,
				2
			),
			{ headers: { "Content-Type": "application/json" } }
		);
	}
}
