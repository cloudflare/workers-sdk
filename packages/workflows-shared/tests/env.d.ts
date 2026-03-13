/* eslint-disable */

declare namespace Cloudflare {
	interface Env {
		ENGINE: DurableObjectNamespace<import("../src/index").Engine>;
		USER_WORKFLOW: import("cloudflare:workers").WorkflowEntrypoint;
	}
}
