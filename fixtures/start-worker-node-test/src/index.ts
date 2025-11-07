import isEven from "is-even";

import { sayHello } from "./say-hello";

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);
		return new Response(
			sayHello(
				isEven(Number(url.searchParams.get("number") ?? "0")) ? "even" : "odd"
			)
		);
	},
} satisfies ExportedHandler;
