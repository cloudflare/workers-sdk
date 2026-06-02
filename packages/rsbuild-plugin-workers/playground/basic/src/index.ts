interface Env {
	MESSAGE: string;
}

export default {
	fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({
				ok: true,
				message: env.MESSAGE,
				pathname: url.pathname,
			});
		}

		return new Response("Rsbuild Workers playground");
	},
} satisfies ExportedHandler<Env>;
