declare namespace Cloudflare {
	interface Env {
		TEST_WORKFLOW: Workflow;
		TEST_LONG_WORKFLOW: Workflow;
	}
}
interface Env extends Cloudflare.Env {}
