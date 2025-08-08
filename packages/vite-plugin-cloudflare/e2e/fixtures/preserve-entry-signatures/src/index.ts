import { A } from "./a";

interface Env {}

export default {
	async fetch(request) {
		console.log("Static import A =", A);
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			await import("./b").then(({ f1 }) => f1());
			return Response.json({
				message: "Dynamic import executed successfully",
				A,
			});
		}

		return Response.json({ message: "Worker running", A });
	},
} satisfies ExportedHandler<Env>;
