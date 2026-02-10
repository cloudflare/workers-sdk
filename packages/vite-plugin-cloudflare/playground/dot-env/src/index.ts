interface Env {
	ENV_NAME: string;
	MY_DEV_VAR_A: string;
	MY_DEV_VAR_B: string;
	MY_DEV_VAR_C: string;
}

export default {
	async fetch(_req, env) {
		const { ENV_NAME, ...variables } = env;
		const extra = ENV_NAME ? ` and .env.${ENV_NAME}` : "";
		return Response.json({
			[`variables loaded from .env${extra}`]: variables,
		});
	},
} satisfies ExportedHandler<Env>;
