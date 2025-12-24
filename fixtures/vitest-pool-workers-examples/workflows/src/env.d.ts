interface BaseEnv {
	MODERATOR: Workflow;
}
declare namespace Cloudflare {
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
