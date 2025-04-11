interface Env {
	MY_VAR: string;
	MY_SECRET: string;
}

export default {
	async fetch(_, env) {
		return new Response(
			`The value of MY_VAR is "${env.MY_VAR}" and the value of MY_SECRET is "${env.MY_SECRET}"`
		);
	},
} satisfies ExportedHandler<Env>;
