interface Env {
	MY_VAR: string;
}

export default {
	async fetch(_, env) {
		return new Response(`The value of MY_VAR is "${env.MY_VAR}"`);
	},
} satisfies ExportedHandler<Env>;
