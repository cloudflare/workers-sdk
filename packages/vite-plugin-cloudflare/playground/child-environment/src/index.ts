declare global {
	// In real world usage, this is accessed by `@vitejs/plugin-rsc`
	function __VITE_ENVIRONMENT_RUNNER_IMPORT__(
		environmentName: string,
		id: string
	): Promise<unknown>;
}

export default {
	async fetch() {
		const childEnvironmentModule = (await __VITE_ENVIRONMENT_RUNNER_IMPORT__(
			"child",
			"./src/child-environment-module"
		)) as { getMessage: () => string };

		return new Response(childEnvironmentModule.getMessage());
	},
} satisfies ExportedHandler;
