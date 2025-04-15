import isEven from "is-even";

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);
		return new Response(
			isEven(Number(url.searchParams.get("number") ?? "0")) ? "even" : "odd"
		);
	},
} satisfies ExportedHandler;
