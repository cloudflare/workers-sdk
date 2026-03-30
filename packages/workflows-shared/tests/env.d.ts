/* eslint-disable */

declare namespace Cloudflare {
	interface Env {
		ENGINE: DurableObjectNamespace<import("../src/index").Engine>;
		USER_WORKFLOW: import("cloudflare:workers").WorkflowEntrypoint;
	}
}

declare module "workerd:unsafe" {
	const unsafe: {
		abortAllDurableObjects(): Promise<void>;
	};
	export default unsafe;
}
