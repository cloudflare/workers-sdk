interface Env {
	MY_VAR: string;
}

export default {
	async fetch(_request, env) {
		return new Response(env.MY_VAR);
	},
} satisfies ExportedHandler<Env>;
