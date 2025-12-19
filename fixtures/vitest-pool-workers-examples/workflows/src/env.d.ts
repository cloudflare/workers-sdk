interface BaseEnv {
	MODERATOR: Workflow<
		Parameters<import("./index").ModeratorWorkflow["run"]>[0]["payload"]
	>;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
