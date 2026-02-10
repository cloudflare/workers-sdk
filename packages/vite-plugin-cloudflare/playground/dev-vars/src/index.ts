interface Env {
	ENV_NAME: string;
	MY_DEV_VAR_A: string;
	MY_DEV_VAR_B: string;
	MY_DEV_VAR_C: string;
}

export default {
	async fetch(_req, env) {
		const { ENV_NAME, ...dotDevDotVarsVariables } = env;
		const extension = ENV_NAME ? `.${ENV_NAME}` : "";
		return Response.json({
			[`variables present in .dev.vars${extension}`]: dotDevDotVarsVariables,
		});
	},
} satisfies ExportedHandler<Env>;
