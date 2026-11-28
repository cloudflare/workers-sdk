/* eslint-disable */

declare namespace Cloudflare {
	interface Env {
		ENGINE: DurableObjectNamespace<import("../src/index").Engine>;
		USER_WORKFLOW: import("cloudflare:workers").WorkflowEntrypoint;
		SAFFRON: import("../src/lib/cron").SaffronService;
	}
}

declare module "workerd:unsafe" {
	const unsafe: {
		abortAllDurableObjects(): Promise<void>;
	};
	export default unsafe;
}
