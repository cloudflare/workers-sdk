interface Env {
	GREETING: string;
}

export default {
	fetch(request, env) {
		return new Response(env.GREETING);
	},
} satisfies ExportedHandler<Env>;
