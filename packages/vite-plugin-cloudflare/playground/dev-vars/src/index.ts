export default {
	async fetch(_req, env) {
		const { ENV_NAME, ...dotDevDotVarsVariables } = env;
		const extension = ENV_NAME ? `.${ENV_NAME}` : "";
		return Response.json({
			[`variables present in .dev.vars${extension}`]: dotDevDotVarsVariables,
		});
	},
} satisfies ExportedHandler<Env>;
