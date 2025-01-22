export default {
	async fetch(_req, env) {
		const { ENV_NAME, MY_DEV_VAR_A, MY_DEV_VAR_B, MY_DEV_VAR_C } = env;
		const dotDevDotVarsVariables = { MY_DEV_VAR_A, MY_DEV_VAR_B, MY_DEV_VAR_C };
		const extension = ENV_NAME ? `.${ENV_NAME}` : "";
		return Response.json({
			[`variables present in .dev.vars${extension}`]: dotDevDotVarsVariables,
		});
	},
} satisfies ExportedHandler<Env>;
